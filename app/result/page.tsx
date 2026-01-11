"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Copy, Download, RefreshCw, Edit2, Home } from "lucide-react"
import Header from "@/components/header"
import ReactMarkdown from "react-markdown"

interface Product {
  name?: string
  url?: string
  description?: string
  features?: string
  advantages?: string
  disadvantages?: string
}

interface SearchResultItem {
  title: string
  snippet: string
  link: string
  source?: string
}

interface ArticleMetadata {
  title: string
  models?: string[]
  searchData?: Record<string, SearchResultItem[]>
  style?: string
  tone?: string
  framework?: string
  contentType?: "appliance" | "beauty" | "gift" | "discussion"
  stylePreference?: "rational" | "experience" | "random"
  generatedAt: string
  // 兼容旧格式
  question?: string
  products?: Product[]
}

export default function ResultPage() {
  const [article, setArticle] = useState("")
  const [metadata, setMetadata] = useState<ArticleMetadata | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [isCopied, setIsCopied] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState("")

  useEffect(() => {
    const stored = sessionStorage.getItem("generatedArticle")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        setArticle(data.article)
        setEditedContent(data.article)
        setMetadata(data.metadata)
      } catch (err) {
        console.error("[v0] Error parsing stored article:", err)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedContent : article)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error("[v0] Copy failed:", err)
    }
  }

  const handleDownload = () => {
    const content = isEditing ? editedContent : article
    const element = document.createElement("a")
    const file = new Blob([content], { type: "text/plain;charset=utf-8" })
    element.href = URL.createObjectURL(file)
    element.download = `article_${Date.now()}.txt`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const handleRegenerate = async () => {
    if (!metadata) return

    setIsRegenerating(true)
    setRegenerateError("")

    try {
      // 使用正确的字段名，兼容旧格式
      const title = metadata.title || metadata.question || ""
      const models = metadata.models || (metadata.products?.map((p) => p.name || "").filter(Boolean) as string[]) || []
      let searchData = metadata.searchData || {}

      if (!title) {
        throw new Error("缺少文章标题，无法重新生成")
      }

      if (models.length === 0) {
        throw new Error("缺少商品型号信息，无法重新生成")
      }

      // 如果缺少搜索数据，自动重新搜索
      if (Object.keys(searchData).length === 0) {
        setRegenerateError("正在重新获取搜索数据...")
        
        // 为每个型号重新搜索
        const newSearchData: Record<string, SearchResultItem[]> = {}
        
        for (const model of models) {
          try {
            const searchResponse = await fetch("/api/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model }),
            })

            if (searchResponse.ok) {
              const searchResult = await searchResponse.json()
              newSearchData[model] = searchResult.results || []
            } else {
              console.warn(`[regenerate] 搜索 ${model} 失败`)
              newSearchData[model] = []
            }
          } catch (searchError) {
            console.error(`[regenerate] 搜索 ${model} 出错:`, searchError)
            newSearchData[model] = []
          }
        }

        // 检查是否至少有一个型号有搜索结果
        const hasResults = Object.values(newSearchData).some((results) => results.length > 0)
        if (!hasResults) {
          throw new Error("无法获取搜索数据，请检查网络连接或返回首页重新生成")
        }

        searchData = newSearchData
      }

      let response
      try {
        response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          models,
          searchData,
          manualPrompt: undefined,
          contentType: metadata.contentType || "discussion",
          stylePreference: metadata.stylePreference || "random",
        }),
      })
      } catch (networkError) {
        console.error("[regenerate] network error:", networkError)
        throw new Error(`网络请求失败: ${networkError instanceof Error ? networkError.message : "无法连接到服务器"}`)
      }

      if (!response.ok) {
        let errorMessage = "重新生成失败"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const text = await response.text()
      if (!text) {
        throw new Error("服务器返回空响应")
      }

      let data
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        console.error("[regenerate] JSON parse error:", parseError)
        throw new Error("服务器返回的数据格式错误")
      }

      if (!data.article) {
        throw new Error("生成的文章内容为空")
      }

      setArticle(data.article)
      setEditedContent(data.article)
      setIsEditing(false)
      sessionStorage.setItem("generatedArticle", JSON.stringify(data))
      setMetadata(data.metadata)
    } catch (err) {
      const message = err instanceof Error ? err.message : "重新生成失败，请重试"
      console.error("[regenerate] error:", err)
      setRegenerateError(message)
    } finally {
      setIsRegenerating(false)
    }
  }

  if (!metadata) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12 text-center">
          <p className="text-sm sm:text-base text-muted-foreground mb-4">还没有生成的文章</p>
          <Button onClick={() => (window.location.href = "/")} className="w-full sm:w-auto">
            <Home className="mr-2 h-4 w-4" />
            返回首页
          </Button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12">
        {/* Meta Info */}
        <div className="mb-6 sm:mb-8 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary text-balance break-words">{metadata.title || metadata.question || "未命名文章"}</h1>
          {(metadata.models && metadata.models.length > 0) || (metadata.products && metadata.products.length > 0) ? (
            <div className="flex flex-wrap gap-2">
              {(metadata.models || metadata.products?.map((p) => p.name || "").filter(Boolean) || []).map((name, idx) => (
                <span key={idx} className="text-xs sm:text-sm bg-accent/20 text-accent-foreground px-2 sm:px-3 py-1 rounded-full break-words">
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-xs sm:text-sm text-muted-foreground">
            生成于 {new Date(metadata.generatedAt).toLocaleString("zh-CN")}
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
          <Button onClick={handleCopy} variant="outline" size="sm">
            <Copy className="mr-2 h-4 w-4" />
            {isCopied ? "已复制" : "复制全文"}
          </Button>
          <Button onClick={handleDownload} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            下载文本
          </Button>
          <Button onClick={() => setIsEditing(!isEditing)} variant="outline" size="sm">
            <Edit2 className="mr-2 h-4 w-4" />
            {isEditing ? "完成编辑" : "编辑文章"}
          </Button>
          <Button onClick={handleRegenerate} disabled={isRegenerating} variant="outline" size="sm">
            {isRegenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新生成
              </>
            )}
          </Button>
          {regenerateError && (
            <div className="w-full mt-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {regenerateError}
            </div>
          )}
          <Button onClick={() => (window.location.href = "/")} variant="outline" size="sm">
            <Home className="mr-2 h-4 w-4" />
            新建
          </Button>
        </div>

        {/* Article Display / Edit */}
        {isEditing ? (
          <Card className="p-4 sm:p-6">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="min-h-96 font-mono text-xs sm:text-sm"
            />
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button onClick={() => setIsEditing(false)} size="sm" className="w-full sm:w-auto">
                保存更改
              </Button>
              <Button
                onClick={() => {
                  setEditedContent(article)
                  setIsEditing(false)
                }}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                取消编辑
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 sm:p-6 md:p-8 prose prose-sm dark:prose-invert max-w-none">
            <div className="text-foreground leading-relaxed whitespace-pre-wrap space-y-4 text-sm sm:text-base break-words">
              <ReactMarkdown>{article}</ReactMarkdown>
            </div>
          </Card>
        )}

        {metadata.products && metadata.products.length > 0 && (
          <div className="mt-6 sm:mt-8 md:mt-12 border-t pt-6 sm:pt-8">
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">使用的商品信息</h2>
            <div className="grid gap-3 sm:gap-4">
              {metadata.products.map((product, idx) => (
                <Card key={idx} className="p-4 sm:p-6 bg-card/50">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground mb-2 sm:mb-3 break-words">{product.name || `商品 ${idx + 1}`}</h3>
                  <div className="space-y-2 text-xs sm:text-sm">
                    {product.features && (
                      <p>
                        <span className="text-muted-foreground">特点：</span>
                        <span className="text-foreground">{product.features}</span>
                      </p>
                    )}
                    {product.advantages && (
                      <p>
                        <span className="text-muted-foreground">优点：</span>
                        <span className="text-foreground">{product.advantages}</span>
                      </p>
                    )}
                    {product.disadvantages && (
                      <p>
                        <span className="text-muted-foreground">缺点：</span>
                        <span className="text-foreground">{product.disadvantages}</span>
                      </p>
                    )}
                    {product.description && (
                      <p>
                        <span className="text-muted-foreground">补充说明：</span>
                        <span className="text-foreground">{product.description}</span>
                      </p>
                    )}
                    {product.url && (
                      <p className="break-all">
                        <span className="text-muted-foreground">链接：</span>
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline break-all"
                        >
                          {product.url}
                        </a>
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Additional Info */}
        <div className="mt-6 sm:mt-8 md:mt-12 border-t pt-6 sm:pt-8">
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">生成信息</h2>
          <div className="grid md:grid-cols-1 gap-4 sm:gap-6 text-xs sm:text-sm">
            <div>
              <p className="text-muted-foreground mb-2">原始问题</p>
              <p className="text-foreground break-words">{metadata.title || metadata.question || "未设置"}</p>
            </div>
            {metadata.models && metadata.models.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-2">商品型号</p>
                <p className="text-foreground break-words">{metadata.models.join("、")}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
