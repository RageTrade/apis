const converter = require('json-2-csv')

export async function json2csv(data: any) {
  console.log('json2csv called')
  if (!data) {
    return null
    // throw new Error('data is nullish')
  }

  return await converter.json2csvAsync(findFirstArray(data))
}

function findFirstArray(data: any) {
  console.log('findFirstArray called')
  if (Array.isArray(data)) {
    return data
  }
  if (typeof data !== 'object') {
    return data
  }
  if (Array.isArray(data.data)) {
    return data.data
  }
  if (Array.isArray(data.dailyData)) {
    return data.dailyData
  }
  if (Array.isArray(data.result)) {
    return data.result
  }
  if (typeof data.result !== 'object') {
    return data.result
  }
  if (Array.isArray(data.result.data)) {
    return data.result.data
  }
  if (Array.isArray(data.result.dailyData)) {
    return data.result.dailyData
  }

  throw new Error('dont know how to find an array here')
}
