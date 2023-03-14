import { config } from 'dotenv'
import path from 'path'
import fs from 'fs-extra'
import { json2csv } from './json-to-csv'
const promptly = require('promptly')

config()

const req = require(path.resolve(process.cwd(), process.argv[2]))

const args = parseBooleans(process.argv.slice(3))
console.log(`Running ${Object.keys(req)[0]}(${args.map((str) => `"${str}"`).join(',')})`)
;(Object.values(req)[0] as Function)(...args).then(async (res: any) => {
  while (true) {
    const question = 'Press P for print on console, C for CSV file and J for JSON file'
    let answer = await promptly.prompt(question)
    answer = answer.toLowerCase()
    if (answer === 'p' || answer === 'print') {
      // PRINT
      const str = JSON.stringify(res, null, 2)
      console.log(str)
    } else if (answer === 'c' || answer === 'csv') {
      // CSV
      const str = await json2csv(res)
      const getFileName = (i: number) => `out${i || ''}.csv`
      let i = 0
      let fileName = ''
      while (fs.existsSync((fileName = getFileName(i)))) {
        i++
      }
      console.log(`writing to ${fileName} please wait...`)
      fs.writeFileSync(fileName, str)
      console.log(`done`)
    } else if (answer === 'j' || answer === 'json') {
      // JSON
      const str = JSON.stringify(res, null, 2)
      const getFileName = (i: number) => `out${i || ''}.json`
      let i = 0
      let fileName = ''
      while (fs.existsSync((fileName = getFileName(i)))) {
        i++
      }
      console.log(`writing to ${fileName} please wait...`)
      fs.writeFileSync(fileName, str)
      console.log(`done`)
    } else {
      console.log('answer not recognized. ')
      continue
    }
    break
  }

  process.exit()
})

function parseBooleans(argv: string[]) {
  return argv.map((arg) => (arg === 'true' ? true : arg === 'false' ? false : arg))
}
