import { fetchJson } from 'ethers/lib/utils'
import fs from 'fs-extra'
const converter = require('json-2-csv')

export async function apiCsv(url: string) {
  console.log('apiCsv called')

  let array: any[] = []
  let pageNumber = 1
  while (true) {
    console.log('pageNumber', pageNumber)
    const resp = await fetchJson({
      url: url + '&pageSize=5000&pageNumber=' + pageNumber,
      timeout: 10000000
    })
    array = [...array, ...resp.result.data]
    if (resp.result.data.length === 5000) {
      pageNumber++
    } else {
      break
    }
  }
  const str = await json2csv(array)

  const getFileName = (i: number) => `out${i || ''}.csv`
  let i = 0
  let fileName = ''
  while (fs.existsSync((fileName = getFileName(i)))) {
    i++
  }

  console.log(`writing to ${fileName} please wait...`)
  fs.writeFileSync(fileName, str)
  console.log(`done`)
}

export async function json2csv(data: any) {
  console.log('json2csv called')
  if (!data) {
    return null
    // throw new Error('data is nullish')
  }

  return await converter.json2csvAsync(findFirstArray(data))
}

export function findFirstArray(data: any) {
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
