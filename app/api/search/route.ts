import { NextResponse } from "next/server"

interface SearchResultItem {
  title: string
  snippet: string
  link: string
  source: "serpstack"
}

interface SearchRequestBody {
  model: string
}

const SERPSTACK_API_KEY = process.env.SERPSTACK_API_KEY

export async function POST(request: Request) {
  try {
    const body: SearchRequestBody = await request.json()
    const model = body.model?.trim()

    if (!model) {
      return NextResponse.json({ error: "型号不能为空" }, { status: 400 })
    }

    if (!SERPSTACK_API_KEY) {
      return NextResponse.json({ error: "SERPSTACK_API_KEY 未配置" }, { status: 500 })
    }

    const results = await querySerpstack(model)

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "未能获取搜索结果，请稍后再试" }, { status: 502 })
    }

    return NextResponse.json({ model, results })
  } catch (error) {
    console.error("[search] error:", error)
    const message = error instanceof Error ? error.message : "搜索失败"
    // 如果是 API key 错误，返回 401；其他错误返回 500
    const status = message.includes("invalid_access_key") || message.includes("API Access Key") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function querySerpstack(model: string): Promise<SearchResultItem[] | null> {
  try {
    const url = `https://api.serpstack.com/search?access_key=${SERPSTACK_API_KEY}&query=${encodeURIComponent(
      model,
    )}&num=10`

    const res = await fetch(url, { next: { revalidate: 0 } })
    
    if (!res.ok) {
      const text = await res.text()
      console.error("[search] serpstack HTTP error:", res.status, text.substring(0, 200))
      throw new Error(`Serpstack API HTTP ${res.status}: ${text.substring(0, 100)}`)
    }

    const data = await res.json()

    if (data.error) {
      const errorMsg = data.error.info || data.error.type || JSON.stringify(data.error)
      console.error("[search] serpstack API error:", errorMsg)
      throw new Error(`Serpstack API 错误: ${errorMsg}`)
    }

    const organic = (data.organic_results || []) as Array<{
      title?: string
      snippet?: string
      url?: string
    }>

    if (!organic.length) return null

    return organic
      .filter((item) => item.title && item.snippet && item.url)
      .map((item) => ({
        title: item.title!,
        snippet: item.snippet!,
        link: item.url!,
        source: "serpstack" as const,
      }))
  } catch (error) {
    console.warn("[search] serpstack fetch error:", error)
    return null
  }
}
