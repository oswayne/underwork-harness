// 对象函数：将当前订单状态置为已完成，入参 context.entity（订单记录）。
await getColl('order').updateOne({ _id: entity._id }, { $set: { status: '已完成' } })
return { status: 0, data: { _id: entity._id, status: '已完成' }, msg: '操作成功' }
