// 静态函数：汇总订单数与订单总金额，入参无，出参 { status, data: { count, totalAmount } }。
const orders = await getColl('order').find({}).toArray()
const totalAmount = orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0)
return { status: 0, data: { count: orders.length, totalAmount }, msg: 'ok' }
