export function renderPlaceholder(title: string, body?: string): void {
  console.log(`\n=== ${title} ===\n`);
  if (body) console.log(body);
}
