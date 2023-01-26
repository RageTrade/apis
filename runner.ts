import path from "path";
import { config } from "dotenv";
config();

const req = require(path.resolve(process.cwd(), process.argv[2]));

(Object.values(req)[0] as Function)(...process.argv.slice(3)).then(
  (res: any) => {
    if (process.argv[process.argv.length - 1] === "print") {
      console.log(JSON.stringify(res));
    }
    process.exit();
  }
);
