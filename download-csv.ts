import { fetchJson } from 'ethers/lib/utils'
import fs from 'fs-extra'
import { json2csv } from './json-to-csv'

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
