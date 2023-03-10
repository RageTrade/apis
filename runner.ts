import { config } from 'dotenv'
import path from 'path'
import yesno from 'yesno'
import fs from 'fs-extra'
import { json2csv } from './json-to-csv'

config()

const req = require(path.resolve(process.cwd(), process.argv[2]))

const args = parseBooleans(process.argv.slice(3))
console.log(`Running ${Object.keys(req)[0]}(${args.map((str) => `"${str}"`).join(',')})`)
;(Object.values(req)[0] as Function)(...args).then(async (res: any) => {
  // const str = JSON.stringify(res, null, 2)
  const str = await json2csv(res)
  if (str) {
    if (str.length < 10 || process.argv[process.argv.length - 1] === 'print') {
      console.log(str)
    } else {
      console.log(
        "Result too long to print, just add ' print' to the end or respond to the question next:"
      )

      const getFileName = (i: number) => `out${i || ''}.csv`
      let i = 0
      let fileName = ''
      while (fs.existsSync((fileName = getFileName(i)))) {
        i++
      }

      const answer = await yesno({
        question: `Press "y" to print in console or "n" to write the output to "${fileName}" file`
      })
      if (answer) {
        console.log(str)
      } else {
        console.log(`writing to ${fileName} please wait...`)
        fs.writeFileSync(fileName, str)
        console.log(`done`)
      }
    }
  }
  process.exit()
})

function parseBooleans(argv: string[]) {
  return argv.map((arg) => (arg === 'true' ? true : arg === 'false' ? false : arg))
}
