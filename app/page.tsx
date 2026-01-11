
"use client"

import type React from "react"

import { useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Header from "@/components/header"
import { Loader2, Plus, Trash2 } from "lucide-react"

interface SearchResultItem {
  title: string
  snippet: string
  link: string
  source: string
}

interface ModelEntry {
  id: string
  name: string
  results: SearchResultItem[]
  isLoading: boolean
  error?: string
}

const MAX_MODELS = 3

const getHostFromLink = (link: string) => {
  try {
    const url = new URL(link)
    return url.hostname.replace(/^www\./, "")
  } catch {
    return link
  }
}

export default function Home() {
  const baseId = useId()
  const [title, setTitle] = useState("")
  const [manualPrompt, setManualPrompt] = useState("")
  const [contentType, setContentType] = useState<"appliance" | "beauty" | "gift" | "discussion">(
    "discussion"
  )
  const [stylePreference, setStylePreference] = useState<"rational" | "experience" | "random">(
    "random"
  )
  const [models, setModels] = useState<ModelEntry[]>([
    { id: `${baseId}-0`, name: "", results: [], isLoading: false },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const activeModels = useMemo(() => models.filter((m) => m.name.trim()), [models])

  const addModel = () => {
    if (models.length >= MAX_MODELS) {
      setError(`最多支持 ${MAX_MODELS} 个型号`)
      return
    }
    setModels((prev) => [...prev, { id: `${baseId}-${prev.length}`, name: "", results: [], isLoading: false }])
  }

  const removeModel = (id: string) => {
    setModels((prev) => prev.filter((model) => model.id !== id))
  }

  const updateModelName = (id: string, value: string) => {
    setModels((prev) => prev.map((model) => (model.id === id ? { ...model, name: value } : model)))
  }

  const handleFetchSearch = async (modelId: string) => {
    const target = models.find((m) => m.id === modelId)
    if (!target) return
    const modelName = target.name.trim()

    if (!modelName) {
      setError("请先输入商品型号")
      return
    }

    setError("")
    setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, isLoading: true, error: undefined } : m)))

    try {
      let response
      try {
        response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelName }),
      })
      } catch (networkError) {
        console.error("[search] network error:", networkError)
        throw new Error(`网络请求失败: ${networkError instanceof Error ? networkError.message : "无法连接到服务器"}`)
      }

      if (!response.ok) {
        let errorMessage = "搜索失败"
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
        console.error("[search] JSON parse error:", parseError, "Response text:", text.substring(0, 200))
        throw new Error("服务器返回的数据格式错误")
      }

      setModels((prev) =>
        prev.map((m) => (m.id === modelId ? { ...m, results: data.results || [], isLoading: false } : m))
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "搜索失败，请重试"
      setModels((prev) =>
        prev.map((m) => (m.id === modelId ? { ...m, isLoading: false, error: message, results: [] } : m))
      )
      setError(message)
    }
  }

  const handleReset = () => {
    setTitle("")
    setManualPrompt("")
    setModels([{ id: `${baseId}-0`, name: "", results: [], isLoading: false }])
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError("请输入知乎问题或标题")
      return
    }

    // 产品型号为可选项：如果用户填写了型号，则需要为每个型号获取搜索信息；
    // 如果没有填写型号，则走纯讨论/分享类生成流程。
    if (activeModels.length > 0) {
      const missingSearch = activeModels.some((model) => model.results.length === 0)
      if (missingSearch) {
        setError("请先为每个型号获取搜索信息")
        return
      }
    }

    const payload = {
      title: title.trim(),
      models: activeModels.map((model) => model.name.trim()),
      // 如果没有 activeModels，传空对象；后端根据 models 长度自动切换生成策略
      searchData:
        activeModels.length > 0
          ? activeModels.reduce<Record<string, SearchResultItem[]>>((acc, model) => {
              acc[model.name.trim()] = model.results
              return acc
            }, {})
          : {},
      manualPrompt: manualPrompt.trim() || undefined,
      contentType,
      stylePreference,
    }

    setError("")
    setIsLoading(true)

    try {
      let response
      try {
        response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
      })
      } catch (networkError) {
        console.error("[generate] network error:", networkError)
        throw new Error(`网络请求失败: ${networkError instanceof Error ? networkError.message : "无法连接到服务器"}`)
      }

      if (!response.ok) {
        let errorMessage = "生成失败"
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
        console.error("[generate] JSON parse error:", parseError, "Response text:", text.substring(0, 200))
        throw new Error("服务器返回的数据格式错误")
      }

      if (!data.article) {
        throw new Error("生成的文章内容为空")
      }

      // 确保保存 searchData 以便重新生成时使用
      const dataToSave = {
        ...data,
        metadata: {
          ...data.metadata,
          searchData: payload.searchData,
        },
      }

      sessionStorage.setItem("generatedArticle", JSON.stringify(dataToSave))
      window.location.href = "/result"
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成出错，请重试"
      console.error("[generate] error:", err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12 lg:py-16">
        <div className="mb-6 sm:mb-8 md:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-3 sm:mb-4 text-balance">知乎长文生成实验室</h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto text-balance px-2">
            输入知乎问题 + 商品型号，系统会调用公开搜索摘要自动拼装出真实、生活化的回答。
          </p>
        </div>

        <Card className="p-4 sm:p-6 md:p-8 lg:p-10 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
            <div className="space-y-2 sm:space-y-3">
              <Label htmlFor="title" className="text-sm sm:text-base font-semibold">
                知乎问题 / 标题 *
              </Label>
              <Textarea
                id="title"
                placeholder="例：预算 6000 元想买大容量冰箱，海尔 506、海尔 511、东芝 548 怎么选？"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-24 text-sm sm:text-base"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">越具体越好，可以直接粘贴你想在知乎发布的标题。</p>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <Label htmlFor="prompt" className="text-sm sm:text-base font-semibold">
                写作提示（可选）
              </Label>
              <Textarea
                id="prompt"
                placeholder="例：想要更口语、结合亲身经历的风格；结尾提醒大家理性消费。"
                value={manualPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
                className="min-h-20 text-sm sm:text-base"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">如果留空，系统会自动使用内置的写作风格。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <Label htmlFor="contentType" className="text-sm sm:text-base font-semibold">
                  内容类型（必选）
                </Label>
                <select
                  id="contentType"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as any)}
                  className="w-full rounded-md border px-3 py-2 text-sm sm:text-base"
                >
                  <option value="discussion">纯讨论（不带货）</option>
                  <option value="appliance">家电/数码（带货示例）</option>
                  <option value="beauty">美妆/护肤（带货示例）</option>
                  <option value="gift">送礼/生活（带货示例）</option>
                </select>
                <p className="text-xs sm:text-sm text-muted-foreground">选择文章的类别，后端会根据类型加载不同的写作提示。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stylePreference" className="text-sm sm:text-base font-semibold">
                  写作倾向（可选）
                </Label>
                <select
                  id="stylePreference"
                  value={stylePreference}
                  onChange={(e) => setStylePreference(e.target.value as any)}
                  className="w-full rounded-md border px-3 py-2 text-sm sm:text-base"
                >
                  <option value="random">随机（默认）</option>
                  <option value="rational">偏理性（决策导向）</option>
                  <option value="experience">偏体验（个人经历）</option>
                </select>
                <p className="text-xs sm:text-sm text-muted-foreground">可选：影响文风侧重点（理性/体验/随机）。</p>
              </div>
            </div>

            <div className="border-t pt-6 sm:pt-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">商品型号（最多 3 个）</h2>
                <Button type="button" variant="outline" size="sm" onClick={addModel} className="gap-2 bg-transparent w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  新增型号
                </Button>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {models.map((model, index) => (
                  <div key={model.id} className="p-4 sm:p-6 border rounded-lg bg-card/50 space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                      <h3 className="text-sm sm:text-base font-semibold">型号 {index + 1}</h3>
                      {models.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeModel(model.id)}
                          className="text-destructive hover:text-destructive h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      </div>

                      <div className="space-y-2 sm:space-y-3">
                      <Label htmlFor={`model-${model.id}`} className="text-sm sm:text-base font-medium">
                        商品型号 *
                        </Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                          id={`model-${model.id}`}
                          placeholder="例：海尔 506、东芝 548"
                          value={model.name}
                          onChange={(e) => updateModelName(model.id, e.target.value)}
                            className="text-sm sm:text-base flex-1"
                          />
                          <Button
                            type="button"
                          onClick={() => handleFetchSearch(model.id)}
                          disabled={model.isLoading}
                          className="w-full sm:w-auto sm:min-w-[120px]"
                          >
                          {model.isLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              搜索中
                              </>
                            ) : (
                            "获取信息"
                            )}
                          </Button>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        系统会通过 Google/Bing 搜索摘要提取参数、功能、真实体验等要点。
                      </p>
                      </div>

                    {model.error && <p className="text-xs sm:text-sm text-destructive break-words">{model.error}</p>}

                    {model.results.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs sm:text-sm font-medium text-muted-foreground">已提取的要点：</p>
                        <ul className="space-y-2 text-xs sm:text-sm">
                          {model.results.map((result, idx) => (
                            <li key={idx} className="rounded-md border p-2 sm:p-3">
                              <p className="font-semibold text-foreground text-sm sm:text-base break-words">{result.title}</p>
                              <p className="text-muted-foreground mt-1 text-xs sm:text-sm leading-relaxed break-words">{result.snippet}</p>
                              <p className="text-xs text-muted-foreground mt-2 break-all">
                                来源：{result.source} · {getHostFromLink(result.link)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    </div>
                ))}
              </div>
            </div>

            {error && <div className="p-3 sm:p-4 bg-destructive/10 text-destructive rounded-lg text-xs sm:text-sm break-words">{error}</div>}

            <div className="border-t pt-6 sm:pt-8 flex flex-col gap-3 sm:gap-4">
              <Button type="submit" size="lg" disabled={isLoading} className="w-full sm:w-auto sm:min-w-[140px]">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  "生成文章"
                )}
              </Button>
              <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto bg-transparent" onClick={handleReset}>
                重置
              </Button>
            </div>
          </form>
        </Card>

        <div className="mt-6 sm:mt-8 md:mt-12 text-center text-xs sm:text-sm text-muted-foreground px-2">
          <p>
            所有数据均来自公开搜索摘要，不做爬虫；商品型号为选填项。如果填写了型号，请确保已成功获取每个型号的信息以便生成带货类回答。
          </p>
        </div>
      </main>
    </div>
  )
}