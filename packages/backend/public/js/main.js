// Zen Capsule — landing page interactions (CSP-safe, no inline handlers)
(function () {
  'use strict'

  // 漸進增強標記：捲動漸顯動畫只在 JS 可用時啟用
  document.documentElement.classList.add('js')

  // ── 導航捲動狀態 ──────────────────────────────────
  const nav = document.getElementById('siteNav')
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  // ── 呼吸引導文字 ──────────────────────────────────
  const breathLabel = document.getElementById('breathLabel')
  if (breathLabel && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const labels = ['— 吸氣 —', '— 暫停 —', '— 吐氣 —', '— 暫停 —']
    let i = 0
    setInterval(() => {
      i = (i + 1) % labels.length
      breathLabel.textContent = labels[i]
    }, 2000)
  }

  // ── 捲動漸顯 ──────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal')
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in')
          io.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    revealEls.forEach((el) => io.observe(el))
  } else {
    revealEls.forEach((el) => el.classList.add('in'))
  }
})()
