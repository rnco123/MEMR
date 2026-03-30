/**
 * `next start` loads middleware in a VM; webpack uses eval() for the middleware bundle.
 * Node's --disallow-code-generation-from-strings (sometimes set via NODE_OPTIONS) breaks that
 * with: EvalError: Code generation from strings disallowed for this context
 * Strip it so production `npm run start` works on Node 20.10+ / 22+.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
let opts = process.env.NODE_OPTIONS || ''
opts = opts.replace(/--disallow-code-generation-from-strings\s*/g, ' ').replace(/\s+/g, ' ').trim()
process.env.NODE_OPTIONS = opts

const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const extra = process.argv.slice(2)
const result = spawnSync(process.execPath, [nextCli, 'start', ...extra], {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
  shell: false,
})

process.exit(result.status === null ? 1 : result.status)
