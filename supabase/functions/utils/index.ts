// Characters that need to be escaped in MarkdownV2
const specialChars = ['_', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

export function escapeMarkdownV2(text: string): string {
  let result = text;
  
  // Escape special characters except * for bold
  specialChars.forEach(char => {
    result = result.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  });
  
  // Handle @ mentions separately to preserve them
  result = result.replace(/@(\w+)/g, '@$1');
  
  return result;
}