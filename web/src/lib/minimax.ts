export const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";

export const MINIMAX_IMAGE_MODELS = ["image-01"];

export const MINIMAX_TEXT_MODELS = ["MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M3"];

export const MINIMAX_IMAGE_GENERATION_SCRIPT = `// MiniMax 生图：原生 /v1/image_generation。
// 官方 Base URL 可填 https://api.minimaxi.com/v1；这里会兼容是否已带 /v1。
// 可用：prompt、params{size,count}、model、baseUrl、apiKey
if (images.length) throw new Error("MiniMax 生图快捷脚本暂只支持文生图");
const apiBase = baseUrl.replace(/\\/+$/, "").replace(/\\/v1$/i, "");
const supportedRatios = ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"];
function closestRatio(value) {
  if (!value || value === "auto") return "1:1";
  if (supportedRatios.includes(value)) return value;
  const match = String(value).match(/^(\\d+)x(\\d+)$/i);
  const parts = match ? [Number(match[1]), Number(match[2])] : String(value).split(":").map(Number);
  if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item) || item <= 0)) return "1:1";
  const target = parts[0] / parts[1];
  return supportedRatios.reduce((best, item) => {
    const [w, h] = item.split(":").map(Number);
    const [bw, bh] = best.split(":").map(Number);
    return Math.abs(w / h - target) < Math.abs(bw / bh - target) ? item : best;
  });
}
const data = await request({
  method: "post",
  url: \`\${apiBase}/v1/image_generation\`,
  headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` },
  data: {
    model,
    prompt,
    aspect_ratio: closestRatio(params.size),
    response_format: "base64",
    n: Math.max(1, Math.min(9, Number(params.count) || 1)),
    prompt_optimizer: true,
  },
});
if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
  throw new Error(data.base_resp.status_msg || \`MiniMax 生图失败：\${data.base_resp.status_code}\`);
}
if (data.error?.message || data.msg) throw new Error(data.error?.message || data.msg);
const items = data.data?.image_base64 || data.data?.images || data.data?.image_urls || data.image_base64 || data.images || [];
const list = Array.isArray(items) ? items : [items];
const urls = list.map((item) => {
  const value = typeof item === "string" ? item : item?.image_base64 || item?.b64_json || item?.url || "";
  if (!value) return "";
  return value.startsWith("data:") || value.startsWith("http") ? value : \`data:image/png;base64,\${value}\`;
}).filter(Boolean);
if (!urls.length) {
  const meta = data.metadata ? \` success=\${data.metadata.success_count ?? "?"} failed=\${data.metadata.failed_count ?? "?"}\` : "";
  throw new Error(\`MiniMax 未返回图片\${meta}\`);
}
return urls;`;

export const MINIMAX_TEXT_CHAT_COMPLETIONS_SCRIPT = `// MiniMax 文本：OpenAI 兼容 Chat Completions。
// 官方 Base URL 可填 https://api.minimaxi.com/v1；这里会兼容是否已带 /v1。
// 可用：messages([{role,content}])、systemPrompt、model、baseUrl、apiKey
const apiBase = baseUrl.replace(/\\/+$/, "").replace(/\\/v1$/i, "");
const data = await request({
  method: "post",
  url: \`\${apiBase}/v1/chat/completions\`,
  headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` },
  data: {
    model,
    messages,
    ...(model.toLowerCase().includes("minimax-m3") ? { thinking: { type: "adaptive" } } : {}),
  },
});
const content = data.choices?.[0]?.message?.content;
const text = typeof content === "string"
  ? content
  : Array.isArray(content)
    ? content.map((item) => item.text || "").join("")
    : "";
if (!text) throw new Error(data.error?.message || "MiniMax 未返回文本");
onDelta(text);
return text;`;
