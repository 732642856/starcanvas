export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#1d1d1f]">
      {/* Navigation */}
      <nav className="mx-auto flex max-w-[1024px] items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/startrails-icon.jpg"
            alt="星轨"
            className="h-10 w-10 rounded-xl object-cover"
          />
          <span className="text-[15px] font-medium tracking-tight">Startrail Ai</span>
        </div>
        <a
          href="/dashboard"
          className="text-[13px] font-medium text-[#0066cc] hover:underline"
        >
          开始创作
        </a>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-[1024px] px-8 pt-24 pb-16">
          <h1 className="text-[56px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d1d1f]">
            Startrail Ai
          </h1>
          <p className="mt-3 text-[28px] font-normal leading-[1.3] text-[#86868b]">
            从灵感，到画面。
          </p>
        <p className="mt-6 max-w-[640px] text-[21px] leading-[1.4] font-normal text-[#86868b]">
          星轨画布把创意构思、分镜草稿和视觉参考放在同一张无限画布上。
          从一句话出发，沉淀成可交给后期的完整项目包。
        </p>
        <div className="mt-10 flex items-center gap-4">
          <a
            href="/dashboard"
            className="rounded-full bg-[#0071e3] px-7 py-3 text-[14px] font-medium text-white transition hover:bg-[#0077ed]"
          >
            开始创作
          </a>
          <a
            href="#how"
            className="rounded-full px-7 py-3 text-[14px] font-medium text-[#0071e3] transition hover:underline"
          >
            了解更多
          </a>
        </div>
      </section>

      {/* Product Visual */}
      <section className="mx-auto max-w-[1024px] px-8 pb-24">
        <div className="overflow-hidden rounded-3xl bg-[#f5f5f7]">
          <div className="relative min-h-[480px] overflow-hidden">
            {/* Subtle grid */}
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #000 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            {/* Nodes */}
            <div className="absolute left-10 top-12 w-52 rounded-2xl border border-[#e5e5ea] bg-white/80 p-4 shadow-sm">
              <p className="text-[11px] font-medium text-[#8e8e93]">分镜节点</p>
              <p className="mt-1.5 text-[13px] text-[#1d1d1f]">
                火柴人站位 + AI 背景生成
              </p>
            </div>
            <div className="absolute right-10 top-20 w-56 rounded-2xl border border-[#e5e5ea] bg-white/80 p-4 shadow-sm">
              <p className="text-[11px] font-medium text-[#8e8e93]">Prompt 分析器</p>
              <p className="mt-1.5 text-[13px] text-[#1d1d1f]">
                从草图、参考图反推完整生成指令
              </p>
            </div>
            <div className="absolute bottom-12 left-24 right-24 rounded-2xl border border-[#e5e5ea] bg-white/80 p-4 shadow-sm">
              <p className="text-[11px] font-medium text-[#8e8e93]">项目包导出</p>
              <p className="mt-1.5 text-[13px] text-[#1d1d1f]">
                整理脚本、分镜、参考图和关键画面，导出给后期继续精修
              </p>
            </div>
            {/* Connection lines */}
            <div className="absolute left-[230px] top-[100px] h-px w-20 rotate-12 bg-[#c7c7cc]" />
            <div className="absolute right-[200px] top-[260px] h-px w-24 rotate-[125deg] bg-[#c7c7cc]" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="border-t border-[#d2d2d7]">
        <div className="mx-auto max-w-[1024px] px-8 py-20">
          <h2 className="text-[32px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
            工作流程
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "创意构思",
                desc: "从一句话、类型感、人物关系出发，沉淀可执行的创作方向。",
              },
              {
                title: "分镜草稿",
                desc: "火柴人也能用：姿态站位 + AI 背景 + 镜头意图，自动补全 Prompt。",
              },
              {
                title: "视觉设计",
                desc: "关键帧、首帧、角色/场景参考图和风格板统一管理。",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-[19px] font-semibold text-[#1d1d1f]">
                  {item.title}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.5] text-[#86868b]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#d2d2d7]">
        <div className="mx-auto max-w-[1024px] px-8 py-20 text-center">
          <h2 className="text-[40px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            准备好开始了吗？
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[17px] text-[#86868b]">
            打开画布，从第一句话开始构建你的视觉故事。
          </p>
          <a
            href="/dashboard"
            className="mt-8 inline-block rounded-full bg-[#0071e3] px-8 py-3.5 text-[14px] font-medium text-white transition hover:bg-[#0077ed]"
          >
            进入 Startrail Ai
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#d2d2d7]">
        <div className="mx-auto max-w-[1024px] px-8 py-6">
          <p className="text-[11px] text-[#86868b]">
            Startrail Ai. 从灵感，到画面。
          </p>
        </div>
      </footer>
    </main>
  )
}
