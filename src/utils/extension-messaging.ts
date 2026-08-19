// 共享工具：扩展内部消息验证
export function isFromThisExtension(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}