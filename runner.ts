import { config } from 'dotenv'
import path from 'path'
config()

const req = require(path.resolve(process.cwd(), process.argv[2]))

;(Object.values(req)[0] as Function)(...process.argv.slice(3)).then((res: any) => {
  const str = JSON.stringify(res, null, 2)
  if (str) {
    if (str.length < 1000 || process.argv[process.argv.length - 1] === 'print') {
      console.log(str)
    } else {
      console.log("Result too long to print, just add ' print' to the end")
    }
  }
  process.exit()
})
