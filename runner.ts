import path from "path";

const req = require(path.resolve(process.cwd(), process.argv[2]));

(Object.values(req)[0] as Function)(...process.argv.slice(3)).then((res: any) =>
  // console.log(JSON.stringify(res))
  process.exit()
);
