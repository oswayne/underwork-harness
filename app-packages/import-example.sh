#!/usr/bin/env bash
# 人工导入示例应用包到测试租户（M1 验收，幂等可重复执行）。
# 用法：BASE_URL=<平台服务地址> JWT=<平台Token> TENANT_ID=<租户ObjectId> app-packages/import-example.sh
# 依赖：curl、node。
# 幂等：按 identifier/路径查找已有记录并复用，只创建缺失项；fixture 仅在实体无数据时写入。
# 重建：如需从零重建，先删除整个 App（DELETE /app-package/:id 级联删除）。
set -euo pipefail

: "${BASE_URL:?请设置 BASE_URL（平台服务地址）}"
: "${JWT:?请设置 JWT（平台 Token）}"
: "${TENANT_ID:?请设置 TENANT_ID（租户 ObjectId）}"

cd "$(dirname "$0")/cszh/dsh-test"

APP_IDENTIFIER="dsh-test"
ENTITY_IDENTIFIER="order"

auth=(-H "Authorization: $JWT" -H "Tenant: $TENANT_ID" -H "Content-Type: application/json")

get_json() {
  curl -sf -H "Authorization: $JWT" -H "Tenant: $TENANT_ID" "$BASE_URL$1"
}

post_json() {
  curl -sf -X POST "$BASE_URL$1" "${auth[@]}" -d "$2"
}

first_id_by() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const list=JSON.parse(s).data||[];const f=process.argv[1],v=process.argv[2];const hit=list.find(x=>x[f]===v);process.stdout.write(hit?hit._id:"")})' "$1" "$2"
}

extract_id() {
  node -e 'const r=JSON.parse(process.argv[1]);const id=r.data?r.data._id:r._id;if(!id){console.error(JSON.stringify(r,null,2));process.exit(1)}process.stdout.write(id)' "$1"
}

echo "[1/6] App: ${APP_IDENTIFIER}"
app_id=$(get_json "/app-package/list" | first_id_by identifier "$APP_IDENTIFIER")
if [ -z "$app_id" ]; then
  app_id=$(extract_id "$(post_json /app-package "$(cat app.json)")")
  echo "  新建 app_id=$app_id"
else
  echo "  已存在 app_id=${app_id} (复用)"
fi

echo "[2/6] Entity: ${ENTITY_IDENTIFIER}"
entity_id=$(get_json "/app-package/entity/list?app=$app_id" | first_id_by identifier "$ENTITY_IDENTIFIER")
if [ -z "$entity_id" ]; then
  entity_payload=$(node -e 'const e=JSON.parse(require("fs").readFileSync("entities/order.json","utf8"));e.app=process.argv[1];delete e.fields;process.stdout.write(JSON.stringify(e))' "$app_id")
  entity_id=$(extract_id "$(post_json /app-package/entity "$entity_payload")")
  echo "  新建 entity_id=$entity_id"
else
  echo "  已存在 entity_id=${entity_id} (复用)"
fi

echo "[3/6] 字段"
existing_fields=$(get_json "/app-package/entity/field/list?entity=$entity_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const list=JSON.parse(s).data||[];for(const f of list)process.stdout.write(f.name+"\n")})')
node -e 'const e=JSON.parse(require("fs").readFileSync("entities/order.json","utf8"));for(const f of e.fields){f.entity=process.argv[1];delete f.extra;process.stdout.write(JSON.stringify(f)+"\n")}' "$entity_id" | while read -r field_json; do
  name=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).name)' "$field_json")
  if echo "$existing_fields" | grep -Fxq "$name"; then
    echo "  复用字段 $name"
  else
    post_json /app-package/entity/field "$field_json" >/dev/null
    echo "  新建字段 $name"
  fi
done

echo "[4/6] 函数"
existing_funcs=$(get_json "/app-package/entity/func/list?entity=$entity_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const list=JSON.parse(s).data||[];for(const f of list)process.stdout.write(f.identifier+"\n")})')
for meta_file in funcs/order/*.meta.json; do
  func_id=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).identifier)' "$meta_file")
  if echo "$existing_funcs" | grep -Fxq "$func_id"; then
    echo "  复用函数 $func_id"
  else
    func_payload=$(node -e 'const meta=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const payload=Object.assign({},meta,{entity:process.argv[2],body:require("fs").readFileSync(process.argv[3],"utf8")});process.stdout.write(JSON.stringify(payload))' "$meta_file" "$entity_id" "funcs/order/$func_id.js")
    post_json /app-package/entity/func "$func_payload" >/dev/null
    echo "  新建函数 $func_id"
  fi
done

echo "[5/6] 菜单"
menu_id=$(get_json "/app-package/menu/list?app=$app_id" | first_id_by path "$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("menus.json","utf8"))[0].path)')")
if [ -z "$menu_id" ]; then
  menu_payload=$(node -e 'const menus=JSON.parse(require("fs").readFileSync("menus.json","utf8"));const m=Object.assign({},menus[0]);m.app=process.argv[1];delete m.page;process.stdout.write(JSON.stringify(m))' "$app_id")
  menu_id=$(extract_id "$(post_json /app-package/menu "$menu_payload")")
  echo "  新建 menu_id=$menu_id"
else
  echo "  已存在 menu_id=${menu_id} (复用)"
fi

echo "[6/6] 页面"
page_exists=$(get_json "/app-package/menu/$menu_id/page" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).data;process.stdout.write(d&&d.type==="page"&&d.title!=="未配置"?"yes":"no")})')
if [ "$page_exists" = "yes" ]; then
  echo "  页面已存在（复用）"
else
  page_file=$(node -e 'const menus=JSON.parse(require("fs").readFileSync("menus.json","utf8"));process.stdout.write("pages/"+menus[0].page+".json")')
  post_json "/app-package/menu/$menu_id/page" "$(cat "$page_file")" >/dev/null
  echo "  新建页面"
fi

echo "[可选] fixture 数据"
data_total=$(get_json "/app-package/entity/$ENTITY_IDENTIFIER/page?perPage=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).data||{};process.stdout.write(String(r.total||0))})')
if [ "$data_total" = "0" ]; then
  node -e 'const records=JSON.parse(require("fs").readFileSync("data/order.json","utf8"));for(const r of records)process.stdout.write(JSON.stringify(r)+"\n")' | while read -r record; do
    post_json "/app-package/entity/$ENTITY_IDENTIFIER" "$record" >/dev/null
  done
  echo "  已写入 fixture"
else
  echo "  实体已有 ${data_total} 条数据，跳过"
fi

echo "[验证] 归属一致性 (全部应指向 app_id=${app_id})"
entity_app=$(get_json "/app-package/entity/$entity_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).data.app||"")})')
[ "$entity_app" = "$app_id" ] && echo "  PASS Entity.app" || { echo "  FAIL Entity.app=$entity_app"; exit 1; }
func_mismatch=$(get_json "/app-package/entity/func/list?entity=$entity_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const list=JSON.parse(s).data||[];const app=process.argv[1],schema=process.argv[2];const bad=list.filter(f=>f.app!==app||f.schema!==schema);process.stdout.write(bad.length?bad.map(f=>f.identifier).join(","):"")})' "$app_id" "$entity_id")
[ -z "$func_mismatch" ] && echo "  PASS Func.app/schema" || { echo "  FAIL Func 归属: $func_mismatch"; exit 1; }
menu_belongs=$(get_json "/app-package/menu/list?app=$app_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const list=JSON.parse(s).data||[];process.stdout.write(list.some(m=>m._id===process.argv[1])?"yes":"no")})' "$menu_id")
[ "$menu_belongs" = "yes" ] && echo "  PASS Menu.app" || { echo "  FAIL Menu 不在该 App 下"; exit 1; }

echo "验证命令："
echo "  列表:   GET $BASE_URL/app-package/entity/$ENTITY_IDENTIFIER/page?perPage=5"
echo "  汇总:   POST $BASE_URL/app-package/entity/$ENTITY_IDENTIFIER/func/summary"
echo "  完成:   POST $BASE_URL/app-package/entity/$ENTITY_IDENTIFIER/<订单ID>/func/complete"
echo "(请自行携带 Authorization / Tenant 头调用以上接口)"
