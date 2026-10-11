export function launchMode(args: readonly string[]) {
  const allowed = ['--no-open'];
  if (args.some((arg) => !allowed.includes(arg))) throw new Error('Unknown app option.');
}
