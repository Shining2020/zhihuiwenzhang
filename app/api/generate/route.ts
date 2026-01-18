import * as fs from "node:fs"
import * as path from "node:path"

interface SearchResultItem {
  title: string
  snippet: string
  link?: string
  source?: string
}

interface GenerateRequest {
  title: string
  models: string[]
  searchData: Record<string, SearchResultItem[]>
  manualPrompt?: string
  contentType?: "appliance" | "beauty" | "gift" | "discussion"
  stylePreference?: "rational" | "experience" | "random"
}

/* ------------------ 工具函数（必须在顶部定义） ------------------ */

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8").trim()
  } catch {
    return ""
  }
}

// parseStructureFrameworks 已在文件顶部定义，避免重复定义

/* ------------------ 初始化 Prompt 文件 ------------------ */

const promptsDir = path.join(process.cwd(), "prompts")
const appliancePrompt = safeRead(path.join(promptsDir, "appliance.md"))
const beautyPrompt = safeRead(path.join(promptsDir, "beauty.md"))
const giftPrompt = safeRead(path.join(promptsDir, "gift.md"))
const discussionPrompt = safeRead(path.join(promptsDir, "discussion.md"))
const structureRules = safeRead(path.join(promptsDir, "structureRules.md"))
const structureFrameworks = parseStructureFrameworks(structureRules)

/**
 * 知乎普通用户人设（system）
 * 只定义“身份 & 写作态度”，不定义具体问题内容
 */
const zhihuPersona = `你是一名长期活跃在知乎的普通用户。

【身份】
- 不是媒体、不是测评机构
- 不接广告、不写软文
- 写回答是因为真的思考过这个问题

【写作状态】
- 像在认真给陌生网友回帖
- 允许犹豫、不确定、改口
- 不追求完美逻辑，但追求真实

【禁止】
- 不要写成测评报告
- 不要写成种草/导购文
- 不要自称“整理”“总结”“查资料”
- 不出现 AI、模型、数据来源、公开信息 等字样

目标：让回答在知乎看起来像真人原创内容。`

export async function POST(request: Request) {
  try {
    const body: GenerateRequest = await request.json()
    const title = body.title?.trim()
    const models = (body.models || []).map((m) => m.trim()).filter(Boolean).slice(0, 3)
    const contentType = body.contentType || "discussion"
    const stylePreference = body.stylePreference || "random"

    if (!title) {
      return Response.json({ error: "标题不能为空" }, { status: 400 })
    }

    // 如果有商品型号，需要搜索数据；如果没有商品，可以没有搜索数据
    const hasModels = models.length > 0
    if (hasModels && (!body.searchData || Object.keys(body.searchData).length === 0)) {
      return Response.json({ error: "缺少搜索数据 searchData" }, { status: 400 })
    }

    const searchDigest = hasModels ? formatSearchData(models, body.searchData || {}) : ""

    const userPrompt = buildPrompt({
      title,
      models,
      searchDigest,
      hasModels,
      writingStyle: stylePreference,
      contentType: contentType,
    })

    const contentPrompt = selectContentPrompt(contentType)
    const styleHint = selectStyleHint(stylePreference)
    const systemPrompt = [zhihuPersona, contentPrompt, styleHint].filter(Boolean).join("\n\n")

    const aiApiUrl =
      process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions"
    const aiApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY

    if (!aiApiKey) {
      return Response.json({ error: "AI_API_KEY 未配置" }, { status: 500 })
    }

    let response
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120秒超时

    try {
      response = await fetch(aiApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.85,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error("[generate] fetch error:", fetchError)
      if (fetchError instanceof Error) {
        if (fetchError.name === "AbortError" || fetchError.message.includes("timeout")) {
          throw new Error("API 请求超时（120秒），请检查网络连接或稍后重试")
        }
        if (fetchError.message.includes("Failed to fetch") || fetchError.message.includes("fetch failed")) {
          throw new Error(`无法连接到 API 服务器 (${aiApiUrl})，请检查网络连接或 API 地址配置`)
        }
        throw new Error(`网络请求失败: ${fetchError.message}`)
      }
      throw new Error("网络请求失败，请稍后重试")
    }

    if (!response.ok) {
      let errorText = ""
      try {
        errorText = await response.text()
      } catch {
        errorText = response.statusText
      }
      console.error("[generate] API error:", response.status, errorText.substring(0, 500))
      throw new Error(`API 调用失败 (${response.status}): ${errorText.substring(0, 200)}`)
    }

    const data = await response.json()
    const article = data.choices?.[0]?.message?.content || ""

    if (!article) {
      throw new Error("生成内容为空")
    }

    return Response.json({
      success: true,
      article,
      metadata: {
        title,
        models,
        contentType: contentType,
        stylePreference: stylePreference,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    )
  }
}

/**
 * ⭐ 核心：根据是否有商品信息选择不同的 Prompt
 */
function buildPrompt({
  title,
  models,
  searchDigest,
  hasModels,
  writingStyle,
  contentType,
}: {
  title: string
  models: string[]
  searchDigest: string
  hasModels: boolean
  writingStyle?: "rational" | "experience" | "random"
  contentType?: "appliance" | "beauty" | "gift" | "discussion"
}): string {
  const styleHint =
    writingStyle === "rational"
      ? "\n写作倾向：偏理性，多给决策思路，少情绪化描述。"
      : writingStyle === "experience"
        ? "\n写作倾向：偏体验，多讲真实感受和细节，允许不完全严谨。"
        : ""

  if (hasModels) {
    // 有商品链接/型号的版本：商品作为例子融入回答
    const modelsText = models.join("、")
    return `你正在知乎回答下面这个问题：

「${title}」

核心写作规则（非常重要）：
1. 必须从“直接回应提问者的核心困惑”开始，而不是商品或个人经历。
2. 回答的重点是：如何判断 / 如何选择 / 如何避免踩坑，而不是推荐具体产品。
3. 商品只是用来说明观点的例子，不是主角。

关于商品的使用方式：
- 可用来举例的商品有：${modelsText}
- 不要求每个商品都写同样多，商品段落不要结构完全一致，可以有的写详细，有的只轻描淡写，允许插入个人跑题或临时感受，避免清单感。
- 允许有的商品只是一笔带过
- 每个被提到的商品，必须同时出现「适合谁」和「不适合谁」
- 商品之间不要形成明显的“清单感”或“评测感”

干货表达方式（重要）：
- 少写"配置说明"，多写"使用判断逻辑"
- 技术点只能用于解释"为什么适合 / 不适合"
- 不写参数表、价格、榜单、推荐语
${contentType === "beauty" ? `
关于香水类商品的香调描述（非常重要）：
- 如果涉及香水，必须详细描述香调：前调、中调、后调
- 用大白话、有吸引力的文字描述香味，让读者能"闻到"那种感觉
- 不要只列香调名称（如"柑橘、茉莉、麝香"），要描述实际闻起来的感觉
- 前调：描述刚喷出来那一刻的感觉（比如"像刚剥开的橙子，清新但不刺鼻"）
- 中调：描述味道稳定后的感觉（比如"慢慢变成温温柔柔的花香，像雨后花园"）
- 后调：描述最后留下的余香（比如"最后是淡淡的木质调，闻起来很安心，像冬天晒太阳的感觉"）
- 可以用生活场景比喻（"像小时候奶奶家的味道""像刚洗完的白衬衫"）
- 可以描述在不同场合的感受（"夏天用很清爽，但冬天感觉有点单薄"）
- 让香调描述成为回答的亮点，用具体、生动的语言让读者产生共鸣` : ""}

语言与风格：
- 第一人称
- 允许犹豫、反复、改口
- 像真实用户边想边打字
- 不要总结全文
${styleHint}

结尾要求：
- 用一个带立场或纠结点的问题收尾
- 让读者忍不住想反驳或分享自己经历

下面是一些背景信息，仅用于你理解商品差异，不要逐字照抄：

${searchDigest}

请直接输出完整回答内容，不解释写作过程。`
  } else {
    // 纯问题回答版本：不带任何商品描述
    return `你正在知乎回答下面这个问题：

「${title}」

写作要求：

- 必须从"直接回应问题本身的核心困惑"开始，先说清楚你的观点。

- 之后用生活经验和观察来支撑观点。

- 允许犹豫、不同角度分析、对比，不要求完全对称。

- 允许提出看法并表达"别人可能不一样"的观点。

- 可以在过程中加入"我自己经历过 / 我身边朋友遇到…"等细节。

- 不要写总结式收尾，而是留一个可以引发讨论的点。

- 不要出现 AI、模型、搜索、数据来源 等字样。

语言风格：

- 口语化、自然、有停顿、可以有转折

- 段落长短不一，更像真实用户写的回答

- 不要用 #、## 等 Markdown 标题符号

请直接开始输出完整回答内容，不解释你的写作过程。${styleHint}`
  }
}

/* ------------------ 工具函数 ------------------ */

function formatSearchData(
  models: string[],
  searchData: Record<string, SearchResultItem[]>
) {
  return models
    .map((model) => {
      const items = searchData[model] || []
      if (!items.length) return `${model}：暂无摘要`
      return `${model}：\n${items
        .slice(0, 4)
        .map((i) => `- ${i.title}：${i.snippet}`)
        .join("\n")}`
    })
    .join("\n\n")
}

function parseStructureFrameworks(content: string) {
  if (!content) return []
  return content
    .split(/\n## /)
    .slice(1)
    .map((section) => {
      const [title, ...rest] = section.split("\n")
      if (!title) return null
      return { title, content: rest.join("\n") }
    })
    .filter(Boolean) as Array<{ title: string; content: string }>
}

function pickRandomFramework() {
  if (!structureFrameworks.length) return undefined
  return structureFrameworks[Math.floor(Math.random() * structureFrameworks.length)]
}

function selectContentPrompt(contentType: string): string {
  switch (contentType) {
    case "appliance":
      return appliancePrompt || discussionPrompt
    case "beauty":
      return beautyPrompt || discussionPrompt
    case "gift":
      return giftPrompt || discussionPrompt
    default:
      return discussionPrompt
  }
}

function selectStyleHint(stylePreference: string): string {
  switch (stylePreference) {
    case "rational":
      return "写作倾向：偏理性，多给决策思路，少感性描述。"
    case "experience":
      return "写作倾向：偏体验，多说真实感受、使用场景、情绪。"
    default:
      return ""
  }
}
