/**
 * 示例脚本的工具函数，提供带 ANSI 颜色的控制台输出。
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";

/** 在蓝色边框面板中打印示例标题。 */
export function printHeader(title: string): void {
  const border = "─".repeat(title.length + 4);
  console.log(`\n${BOLD}${BLUE}┌${border}┐${RESET}`);
  console.log(`${BOLD}${BLUE}│  ${title}  │${RESET}`);
  console.log(`${BOLD}${BLUE}└${border}┘${RESET}`);
}

/** 打印区块标题。 */
export function printSection(title: string): void {
  console.log(`\n${BOLD}${CYAN}${title}${RESET}`);
}

/** 打印普通信息（灰色）。 */
export function printInfo(message: string): void {
  console.log(`${DIM}${message}${RESET}`);
}

/** 打印列表项（带前缀 -）。 */
export function printItem(item: string): void {
  console.log(`  ${DIM}-${RESET} ${item}`);
}

/** 打印用户消息（绿色）。 */
export function printUser(message: string): void {
  console.log(`${BOLD}${GREEN}User:${RESET} ${message}`);
}

/** 打印 Agent 响应（品红色）。 */
export function printAgent(message: string): void {
  console.log(`${BOLD}${MAGENTA}Agent:${RESET} ${DIM}${message}${RESET}\n`);
}

/** 打印完成提示。 */
export function printDone(): void {
  console.log(`\n${BOLD}${GREEN}Done!${RESET}`);
}
