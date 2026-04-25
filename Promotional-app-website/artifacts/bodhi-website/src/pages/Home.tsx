import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { HolographicBackground } from "@/components/ui/holographic-background";
import { Button } from "@/components/ui/button";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { ArrowRight, Plane, Activity, ShieldAlert, FileText, Zap } from "lucide-react";
import { OrbitRing } from "@/components/ui/OrbitRing";
import { CounterStat } from "@/components/ui/CounterStat";

/* ─── Main page ─── */
export default function Home() {
  const parallaxRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0]);

  useEffect(() => {
    let frame = 0;
    const handle = (e: MouseEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!parallaxRef.current) return;
        const x = (e.clientX / window.innerWidth - 0.5) * 36;
        const y = (e.clientY / window.innerHeight - 0.5) * 36;
        parallaxRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    };
    window.addEventListener("mousemove", handle, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="min-h-screen relative text-white bg-[#0A0A1A]">
      <HolographicBackground />

      {/* ── HERO ── */}
      <section className="relative min-h-[100dvh] flex flex-col pt-20 overflow-hidden">

        {/* 3D Sphere cluster — mouse-parallax */}
        <div
          ref={parallaxRef}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
          style={{
            transform: "translate3d(0px, 0px, 0)",
            transition: "transform 0.12s ease-out",
            willChange: "transform",
          }}
        >
          {/* Glow halo behind sphere */}
          <div className="absolute w-[420px] h-[420px] md:w-[600px] md:h-[600px] rounded-full bg-[#7B2FFF]/20 blur-[80px]" />
          <div className="absolute w-[260px] h-[260px] md:w-[380px] md:h-[380px] rounded-full bg-[#FF0080]/15 blur-[60px]" />

          {/* Main Sphere */}
          <div className="relative w-[280px] h-[280px] md:w-[460px] md:h-[460px] rounded-full">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.18) 0%, rgba(30,10,80,0.7) 50%, rgba(10,10,26,1) 100%)",
                boxShadow: "inset 0 0 80px rgba(255,255,255,0.06), 0 0 100px rgba(123,47,255,0.3)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            />
            {/* Rim light */}
            <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 70% 75%, rgba(198,255,0,0.12) 0%, transparent 55%)" }} />
            {/* Inner core */}
            <div className="absolute inset-[30%] rounded-full bg-[#7B2FFF]/30 blur-[20px]" />
          </div>

          <div className="absolute w-[520px] h-[520px] md:w-[760px] md:h-[760px] rounded-full border border-primary/10 hero-tilt-ring" />
          <div className="absolute w-[380px] h-[380px] md:w-[620px] md:h-[620px] rounded-full border border-purple-400/10 hero-tilt-ring-reverse" />

          <motion.div
            animate={{ y: [0, -18, 0], rotate: [-7, -2, -7] }}
            transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
            className="absolute hidden md:block left-[13%] top-[24%] w-56 rounded-[2rem] border border-primary/20 bg-black/45 backdrop-blur-2xl p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] pointer-events-none"
            style={{ transformStyle: "preserve-3d" }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary/70 mb-3">Live Split</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="font-display text-4xl font-black text-white">$840</span>
              <span className="text-primary font-black pb-1">settled</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" animate={{ width: ["32%", "88%", "58%", "92%"] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }} />
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 22, 0], rotate: [8, 3, 8] }}
            transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
            className="absolute hidden md:block right-[12%] bottom-[21%] w-60 rounded-[2rem] border border-pink-400/20 bg-black/45 backdrop-blur-2xl p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] pointer-events-none"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-pink-300/70 mb-3">Immune Ping</p>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-pink-500/20 border border-pink-300/30 flex items-center justify-center text-pink-300 font-black">!</span>
              <div>
                <p className="font-black text-white">Duplicate charge</p>
                <p className="text-white/40 text-sm font-medium">Blocked before it posted</p>
              </div>
            </div>
          </motion.div>

          {/* Floating coins */}
          <div className="absolute coin-float-1" style={{ top: "22%", left: "28%" }}>
            <div className="w-14 h-14 rounded-full border border-white/25 bg-gradient-to-tr from-primary/30 to-transparent backdrop-blur-md shadow-[0_0_25px_rgba(198,255,0,0.35)] flex items-center justify-center">
              <span className="text-primary font-black text-lg font-display">$</span>
            </div>
          </div>
          <div className="absolute coin-float-2" style={{ bottom: "22%", right: "26%" }}>
            <div className="w-18 h-18 rounded-full border border-white/25 bg-gradient-to-tr from-purple-500/30 to-transparent backdrop-blur-md shadow-[0_0_25px_rgba(123,47,255,0.35)] flex items-center justify-center" style={{ width: 72, height: 72 }}>
              <span className="text-white font-black text-2xl font-display">₹</span>
            </div>
          </div>
          <div className="absolute coin-float-3" style={{ top: "35%", right: "30%" }}>
            <div className="w-10 h-10 rounded-full border border-white/25 bg-gradient-to-tr from-blue-500/30 to-transparent backdrop-blur-md shadow-[0_0_20px_rgba(0,212,255,0.35)] flex items-center justify-center">
              <span className="text-blue-300 font-black text-sm font-display">€</span>
            </div>
          </div>
          <div className="absolute coin-float-4" style={{ bottom: "30%", left: "32%" }}>
            <div className="w-12 h-12 rounded-full border border-white/20 bg-gradient-to-tr from-pink-500/30 to-transparent backdrop-blur-md shadow-[0_0_20px_rgba(255,0,128,0.3)] flex items-center justify-center">
              <span className="text-pink-300 font-black text-base font-display">£</span>
            </div>
          </div>
        </div>

        {/* Hero copy — flex-1 so it fills the space above the stats strip */}
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="container mx-auto px-6 relative z-10 flex-1 flex flex-col items-center justify-center text-center py-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, type: "spring" }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl mb-10"
          >
            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(198,255,0,1)] animate-pulse" />
            <span className="text-xs font-black tracking-[0.2em] uppercase text-white/80">Main Character Money</span>
          </motion.div>

          <motion.h1
            className="font-display font-black text-[clamp(4rem,14vw,140px)] leading-[0.85] tracking-tighter mb-8"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
          >
            YOUR MONEY.
            <br />
            <motion.span
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4, type: "spring" }}
              className="text-primary italic inline-block mt-4"
              style={{ textShadow: "0 0 60px rgba(198,255,0,0.5)" }}
            >
              ALIVE!
            </motion.span>
          </motion.h1>

          <motion.p
            className="text-lg text-white/50 font-medium max-w-md mb-12 leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            The super-app that makes finance social, intelligent, and actually fun.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            <Button
              size="lg"
              className="group h-14 px-10 text-base font-black bg-white text-black hover:bg-primary hover:text-black rounded-2xl w-full sm:w-auto shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(198,255,0,0.5)] transition-all duration-300"
            >
              <FaApple className="mr-3 h-6 w-6" /> App Store
            </Button>
            <Button
              size="lg"
              className="group h-14 px-10 text-base font-black bg-black/30 text-white border border-white/15 hover:bg-white/8 rounded-2xl w-full sm:w-auto backdrop-blur-xl transition-all"
              onClick={() => window.location.href = '/downloads/bodhi-v2.apk'}
            >
              <FaGooglePlay className="mr-3 h-5 w-5" /> Download (v2)
            </Button>
          </motion.div>
        </motion.div>

        {/* Stats strip — natural flow element, always below the copy */}
        <div className="relative z-10 w-full border-t border-white/8 bg-black/50 backdrop-blur-2xl">
          <div className="container mx-auto px-6 py-5 flex flex-wrap justify-around items-center gap-6">
            {[
              { end: 8, suffix: "M+", label: "Users", prefix: "", className: "text-primary" },
              { end: 425, suffix: "Cr+", label: "Transacted", prefix: "₹", className: "text-white" },
              { end: 4, suffix: "", label: "Superpowers", prefix: "", className: "text-purple-400" },
              { end: 99, suffix: "%", label: "Uptime", prefix: "", className: "text-blue-400" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <CounterStat
                  end={s.end}
                  prefix={s.prefix}
                  suffix={s.suffix}
                  className={`block font-display font-black text-3xl md:text-4xl ${s.className} mb-0.5`}
                />
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ORBIT SECTION ── */}
      <section className="py-24 sm:py-32 relative z-10 bg-[#0A0A1A] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full" />
        </div>
        <div className="container mx-auto px-6 relative">
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="text-xs font-black uppercase tracking-[0.3em] text-primary/80 mb-4 block">The Ecosystem</span>
              <h2 className="font-display font-black text-[clamp(3.25rem,14vw,4.5rem)] md:text-7xl uppercase leading-[0.95] mb-4 tracking-tighter">
                Four Superpowers
              </h2>
              <p className="text-lg text-white/50 max-w-lg mx-auto font-medium">
                Hover any node to explore. One app, every financial power you need.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 150, damping: 20 }}
          >
            <OrbitRing />
          </motion.div>
        </div>
      </section>

      {/* ── MARQUEE 1 ── */}
      <div className="w-full overflow-hidden py-10 bg-primary text-black transform -rotate-[1.5deg] scale-105 relative z-20 border-y-2 border-black">
        <div className="marquee-track">
          {[...Array(14)].map((_, i) => (
            <span key={i} className="font-display font-black text-4xl sm:text-5xl md:text-7xl px-6 sm:px-8 uppercase flex items-center gap-6 sm:gap-8 whitespace-nowrap">
              Zero Drama
              <span className="w-4 h-4 rounded-full bg-black flex-shrink-0" />
              Pool Capital
              <span className="w-4 h-4 rounded-full bg-black flex-shrink-0" />
              Share Alpha
              <span className="w-4 h-4 rounded-full bg-black flex-shrink-0" />
            </span>
          ))}
        </div>
      </div>

      <section className="py-24 sm:py-32 relative z-10 overflow-hidden bg-[#05050A] border-y border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 h-[780px] w-[780px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_90deg,rgba(198,255,0,0.18),rgba(123,47,255,0.18),rgba(255,0,128,0.16),rgba(0,212,255,0.14),rgba(198,255,0,0.18))] blur-[120px] opacity-50 spin-slower" />
          <div className="absolute inset-0 dimensional-grid opacity-25" />
        </div>
        <div className="container mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            className="max-w-3xl mb-16"
          >
            <span className="text-xs font-black uppercase tracking-[0.3em] text-primary/70 mb-4 block">More than screens</span>
            <h2 className="font-display font-black text-[clamp(3.4rem,14vw,6rem)] md:text-8xl uppercase leading-none tracking-tighter">
              A living<br />
              <span className="text-primary italic">money layer</span>
            </h2>
            <p className="text-lg text-white/50 mt-6 font-medium max-w-xl">
              Every balance, group, policy, and alert becomes a spatial system that moves with you instead of sitting flat on a dashboard.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-12 items-center">
            <div className="space-y-5">
              {[
                { title: "Pool capital", body: "Shared goals stack up as animated vault layers.", color: "text-primary", border: "border-primary/25" },
                { title: "Understand risk", body: "Policies unfold into readable, glowing story cards.", color: "text-blue-400", border: "border-blue-400/25" },
                { title: "Catch problems", body: "Background AI sends dimensional pings only when needed.", color: "text-pink-400", border: "border-pink-400/25" },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, type: "spring" }}
                  whileHover={{ x: 16, scale: 1.03 }}
                  className={`group rounded-[2rem] border ${item.border} bg-white/[0.035] backdrop-blur-2xl p-5 sm:p-6 shadow-[0_22px_70px_rgba(0,0,0,0.32)]`}
                >
                  <div className="flex items-center justify-between gap-4 sm:gap-5">
                    <div className="min-w-0">
                      <h3 className={`font-display font-black text-2xl sm:text-3xl tracking-tighter ${item.color}`}>{item.title}</h3>
                      <p className="text-white/52 font-medium mt-2">{item.body}</p>
                    </div>
                    <ArrowRight className="w-6 h-6 text-white/20 group-hover:text-primary transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, rotateX: 22, rotateY: -24, y: 50 }}
              whileInView={{ opacity: 1, rotateX: 16, rotateY: -18, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className="relative h-[460px] sm:h-[520px] lg:h-[560px] [perspective:1200px]"
            >
              <div className="absolute inset-0 rounded-[4rem] border border-white/10 bg-white/[0.025] backdrop-blur-xl shadow-[0_40px_120px_rgba(0,0,0,0.55)]" />
              {[
                { top: "8%", left: "18%", rotate: "-12deg", title: "Squad Alpha", value: "+18.4%", tone: "primary" },
                { top: "30%", left: "43%", rotate: "10deg", title: "Trip Pass", value: "$2,104", tone: "purple" },
                { top: "54%", left: "14%", rotate: "7deg", title: "Policy Brain", value: "3 gaps", tone: "blue" },
                { top: "67%", left: "48%", rotate: "-9deg", title: "Immune AI", value: "2 blocks", tone: "pink" },
              ].map((card, i) => (
                <motion.div
                  key={card.title}
                  animate={{ y: [0, i % 2 ? 18 : -18, 0], rotate: [card.rotate, card.rotate, card.rotate] }}
                  transition={{ repeat: Infinity, duration: 6 + i, ease: "easeInOut", delay: i * 0.3 }}
                  whileHover={{ scale: 1.08, zIndex: 40 }}
                  className={`absolute w-40 sm:w-56 rounded-[1.5rem] sm:rounded-[2rem] border bg-black/65 backdrop-blur-2xl p-4 sm:p-6 shadow-[0_32px_90px_rgba(0,0,0,0.55)] dimensional-card dimensional-card-${card.tone}`}
                  style={{ top: card.top, left: card.left, transform: `rotate(${card.rotate}) translateZ(${i * 28}px)` }}
                >
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.26em] text-white/35 mb-3 sm:mb-4">Bodhi layer</p>
                  <h3 className="font-black text-white text-base sm:text-xl mb-2">{card.title}</h3>
                  <p className="font-display font-black text-3xl sm:text-4xl text-primary">{card.value}</p>
                </motion.div>
              ))}
              <div className="absolute inset-x-16 bottom-10 h-10 rounded-full bg-black/70 blur-xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 1: SQUAD VAULTS ── */}
      <section className="py-24 sm:py-32 lg:py-40 relative z-10 overflow-hidden bg-gradient-to-b from-[#0A0A1A] to-[#0d0a1e]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center mb-20"
          >
            <span className="text-xs font-black uppercase tracking-[0.3em] text-primary/70 mb-4 block">Feature 01</span>
            <h2 className="font-display font-black text-[clamp(3.4rem,14vw,6rem)] md:text-8xl uppercase leading-[0.95] mb-4 tracking-tighter" style={{ textShadow: "0 0 60px rgba(198,255,0,0.2)" }}>
              Squad Vaults
            </h2>
            <p className="text-xl sm:text-2xl text-primary font-black mb-3">Invest together. Win together.</p>
            <p className="text-lg text-white/50 font-medium max-w-xl mx-auto">
              Micro-investment clubs for your crew. Pool capital, vote on plays, share the alpha.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="glass-card rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] hover-lift"
            >
              <div className="flex flex-col lg:flex-row items-start gap-10">
                <div className="flex-1 w-full">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-5">
                    <div>
                      <h3 className="text-xl font-black mb-0.5">Tokyo 2025 Fund</h3>
                      <p className="text-white/40 text-sm font-medium">4 Members · Active</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-black text-2xl sm:text-3xl text-primary">$12,450</p>
                      <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Total Pooled</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-6 border border-white/8">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: "75%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                      className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full shadow-[0_0_15px_rgba(198,255,0,0.5)]"
                    />
                  </div>
                  <p className="text-white/40 text-xs font-bold mb-6">75% of goal · $16,600 target</p>

                  {/* Member rows */}
                  <div className="space-y-3">
                    {[
                      { name: "Alex (You)", amount: "$4,150", pct: "33%", color: "from-primary to-[#00D4FF]" },
                      { name: "Jordan", amount: "$3,500", pct: "28%", color: "from-[#FF0080] to-[#7B2FFF]" },
                      { name: "Sam", amount: "$4,800", pct: "39%", color: "from-[#00D4FF] to-[#7B2FFF]" },
                    ].map((user, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 + 0.4 }}
                        className="flex items-center justify-between gap-3 bg-black/30 p-3.5 rounded-2xl border border-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.color} flex items-center justify-center font-black text-black text-sm border-2 border-black`}>
                            {user.name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm">{user.name}</p>
                            <p className="text-white/35 text-xs">{user.pct} share</p>
                          </div>
                        </div>
                        <span className="font-black text-base">{user.amount}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Vote card */}
                <div className="w-full lg:w-56 bg-black/50 rounded-3xl p-6 border border-white/10 flex-shrink-0">
                  <h4 className="font-black text-base mb-5 text-center uppercase tracking-wider text-white/60">Next Vote</h4>
                  <div className="glass-card rounded-2xl p-4 text-center mb-4 border border-primary/30 shadow-[0_0_20px_rgba(198,255,0,0.1)]">
                    <p className="font-black text-2xl text-primary mb-1">AAPL</p>
                    <p className="text-sm text-white/50 mb-5">Allocate $2,000?</p>
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-primary text-black hover:bg-primary/90 font-black text-sm h-9">Yes</Button>
                      <Button className="flex-1 bg-white/8 text-white hover:bg-white/15 font-black text-sm h-9">No</Button>
                    </div>
                  </div>
                  <div className="text-center text-xs text-white/30 font-bold">3 / 4 voted</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE 2 (reverse) ── */}
      <div className="w-full overflow-hidden py-8 bg-[#7B2FFF] text-white transform rotate-[1deg] scale-105 relative z-20 border-y border-black">
        <div className="marquee-track-reverse">
          {[...Array(18)].map((_, i) => (
            <span key={i} className="font-display font-black text-2xl sm:text-3xl md:text-5xl px-5 sm:px-6 uppercase flex items-center gap-5 sm:gap-6 whitespace-nowrap">
              No IOUs Ever <span className="w-3 h-3 rounded-full bg-white flex-shrink-0" />
            </span>
          ))}
        </div>
      </div>

      {/* ── FEATURE 2: TRIP WALLET ── */}
      <section className="py-24 sm:py-32 lg:py-40 relative z-10 overflow-hidden bg-[#0A0A1A]">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative">
          <div className="flex flex-col lg:flex-row items-center gap-16 xl:gap-24">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ type: "spring" }}
              className="flex-1 min-w-0"
            >
              <span className="text-xs font-black uppercase tracking-[0.3em] text-purple-400/70 mb-4 block">Feature 02</span>
              <h2 className="font-display font-black text-[clamp(3.5rem,15vw,6rem)] md:text-8xl uppercase mb-4 tracking-tighter leading-none">
                Trip<br />Wallet
              </h2>
              <p className="text-xl sm:text-2xl text-purple-400 font-black mb-6">Everyone pays. Nobody chases.</p>
              <p className="text-lg text-white/50 font-medium mb-10 max-w-md leading-relaxed">
                Temporary shared wallets for trips, dinners, and events. Everyone chips in upfront. Refunds auto-settle when it's over.
              </p>
              <ul className="space-y-4">
                {[
                  "Create a shared wallet in under 10 seconds",
                  "Issue virtual cards to all members instantly",
                  "Remaining funds auto-settle on checkout",
                ].map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 + 0.3 }}
                    className="flex items-start gap-3 text-white/70 font-medium"
                  >
                    <span className="text-purple-400 font-black mt-0.5 flex-shrink-0">—</span>
                    {item}
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* Trip card visual */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring" }}
              className="flex-1 relative h-[420px] sm:h-[480px] w-full max-w-md"
            >
              {/* Main card */}
              <div
                className="absolute top-6 sm:top-8 left-2 sm:left-8 right-2 sm:right-8 glass-card rounded-[2rem] p-5 sm:p-8 border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl bg-gradient-to-br from-[#1c1040]/80 to-[#0A0A1A]/80 hover-lift z-20"
              >
                <div className="flex justify-between items-start gap-4 mb-8 sm:mb-10">
                  <div>
                    <p className="text-white/40 text-xs font-black uppercase tracking-widest mb-1">Bodhi Pass</p>
                    <h4 className="text-2xl font-black text-white">Bali 2024</h4>
                  </div>
                  <div className="w-11 h-7 rounded-md bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.4)]">
                    <div className="w-5 h-3.5 rounded-sm bg-yellow-200/50" />
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-white/40 text-xs mb-1 font-medium">Available Balance</p>
                    <p className="font-display font-black text-3xl sm:text-4xl text-white">$2,104<span className="text-lg sm:text-xl text-white/60">.50</span></p>
                  </div>
                  <div className="flex -space-x-2.5 flex-shrink-0">
                    {["from-primary to-cyan-400", "from-purple-500 to-pink-500", "from-orange-400 to-red-500", "from-blue-400 to-purple-500"].map((g, i) => (
                      <div key={i} className={`w-9 h-9 rounded-full bg-gradient-to-br ${g} border-2 border-[#1c1040]`} />
                    ))}
                  </div>
                </div>

                {/* Mini transaction */}
                <div className="mt-6 pt-6 border-t border-white/8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                        <Plane className="w-4 h-4 text-red-400" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">Airbnb Split</p>
                        <p className="text-white/30 text-xs">Just now</p>
                      </div>
                    </div>
                    <p className="font-black text-red-400">-$450</p>
                  </div>
                </div>
              </div>

              {/* Floating notification */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, type: "spring" }}
                className="absolute bottom-0 right-0 z-30 glass-card rounded-2xl p-4 border border-primary/30 bg-black/70 backdrop-blur-xl shadow-[0_0_30px_rgba(198,255,0,0.15)] w-52 sm:w-56"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-black font-black text-xs">Jo</span>
                  </div>
                  <div>
                    <p className="font-black text-xs text-primary">Jordan paid in</p>
                    <p className="font-black text-white">+$230.00</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 3: INSURANCE BRAIN ── */}
      <section className="py-24 sm:py-32 lg:py-40 relative z-10 overflow-hidden bg-[#05050A] border-y border-white/5">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/8 blur-[140px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <span className="text-xs font-black uppercase tracking-[0.3em] text-blue-400/70 mb-4 block">Feature 03</span>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6 border border-blue-500/50 shadow-[0_0_30px_rgba(0,212,255,0.3)]">
              <FileText className="w-7 h-7 text-blue-400" />
            </div>
            <h2 className="font-display font-black text-[clamp(3.5rem,15vw,6rem)] md:text-8xl uppercase leading-[0.95] mb-4 tracking-tighter text-white">
              Insurance<br />Brain
            </h2>
            <p className="text-xl sm:text-2xl text-blue-400 font-black mb-4">Your policy. Finally readable.</p>
            <p className="text-lg text-white/50 font-medium max-w-xl mx-auto leading-relaxed">
              Upload any insurance PDF. Ask "Am I covered?" Get a real, human answer. Swipe through what they hid on page 47.
            </p>
          </motion.div>

          {/* Original 3-card tilted story layout */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-6 md:gap-4 py-8 sm:py-10 px-0 sm:px-4">
            {[
              {
                title: "Coverage",
                icon: ShieldAlert,
                color: "text-green-400",
                bg: "bg-green-400/10",
                border: "border-green-400/30",
                text: "You are covered up to $50k for out-of-network ER visits.",
                rotate: -6,
                highlight: false,
              },
              {
                title: "Loopholes",
                icon: Activity,
                color: "text-red-400",
                bg: "bg-red-400/10",
                border: "border-red-400/30",
                text: 'Dental exclusions apply if injury occurred during "extreme sports".',
                rotate: 0,
                highlight: true,
              },
              {
                title: "Insights",
                icon: Zap,
                color: "text-blue-400",
                bg: "bg-blue-400/10",
                border: "border-blue-400/30",
                text: "You're paying $40/mo for vision you haven't used in 3 years.",
                rotate: 6,
                highlight: false,
              },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, type: "spring", bounce: 0.3 }}
                  className={`glass-card rounded-[2rem] w-full max-w-[280px] md:w-[280px] h-[380px] sm:h-[400px] p-6 border ${card.border} flex flex-col hover-lift flex-shrink-0 ${card.highlight ? "shadow-[0_0_50px_rgba(255,255,255,0.08)]" : ""}`}
                  style={{
                    rotate: card.rotate,
                    zIndex: card.highlight ? 20 : 10,
                    scale: card.highlight ? 1.06 : 1,
                  }}
                >
                  {/* Story progress bars */}
                  <div className="flex gap-1 mb-6">
                    <div className={`h-1 flex-1 rounded-full ${i >= 0 ? "bg-white" : "bg-white/20"}`} />
                    <div className={`h-1 flex-1 rounded-full ${i >= 1 ? "bg-white" : "bg-white/20"}`} />
                    <div className={`h-1 flex-1 rounded-full ${i >= 2 ? "bg-white" : "bg-white/20"}`} />
                  </div>

                  <div className={`w-12 h-12 rounded-full ${card.bg} flex items-center justify-center mb-6`}>
                    <Icon className={`w-6 h-6 ${card.color}`} />
                  </div>

                  <h3 className={`font-display font-black text-3xl mb-4 ${card.color}`}>{card.title}</h3>
                  <p className="text-white/80 font-medium text-lg leading-relaxed flex-1">"{card.text}"</p>

                  <div className="mt-auto pt-4 border-t border-white/10 flex justify-center">
                    <span className="text-white/35 text-xs font-black uppercase tracking-widest">Swipe for more</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURE 4: IMMUNE SYSTEM ── */}
      <section className="py-24 sm:py-32 lg:py-40 relative z-10 bg-black overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #FF0080 0%, transparent 60%)" }} />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <span className="text-xs font-black uppercase tracking-[0.3em] text-pink-400/70 mb-4 block">Feature 04</span>
            <h2 className="font-display font-black text-[clamp(3.5rem,15vw,6rem)] md:text-8xl uppercase leading-[0.95] tracking-tighter" style={{ textShadow: "0 0 60px rgba(255,0,128,0.4)" }}>
              Immune<br />System
            </h2>
            <p className="text-xl sm:text-2xl text-pink-400 font-black mt-4 mb-4">Your money's bodyguard.</p>
            <p className="text-lg text-white/50 font-medium max-w-xl mx-auto leading-relaxed">
              Runs silently in the background. Surfaces only when it catches anomalies, risky spending, or unused subs.
            </p>
          </motion.div>

          {/* EKG line */}
          <div className="relative w-full flex items-center justify-center mb-16">
            <svg
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              className="w-full h-24 heartbeat-line opacity-20"
              style={{ stroke: "#FF0080", strokeWidth: 2, fill: "none" }}
            >
              <path d="M0,60 L150,60 L180,60 L200,20 L220,100 L240,60 L260,60 L290,40 L310,80 L330,60 L500,60 L530,60 L550,15 L570,105 L590,60 L620,60 L650,50 L670,70 L690,60 L900,60 L930,60 L950,25 L970,95 L990,60 L1200,60" />
            </svg>
          </div>

          {/* Alert cards — static layout, no broken absolute positioning */}
          <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
            {[
              {
                icon: "!",
                title: "Unused Sub",
                body: "You haven't opened Netflix in 3 months. Cancel it?",
                color: "border-pink-400/40 bg-pink-400/8 shadow-[0_0_30px_rgba(255,0,128,0.15)]",
                iconBg: "bg-pink-500",
              },
              {
                icon: Activity,
                title: "Dining Spike",
                body: "Spending is up 40% this week on food. Just a heads up.",
                color: "border-primary/40 bg-primary/8 shadow-[0_0_30px_rgba(198,255,0,0.15)]",
                iconBg: "bg-primary",
                iconText: true,
              },
              {
                icon: "!",
                title: "Duplicate Charge",
                body: "Spotify charged you twice this billing cycle.",
                color: "border-red-400/40 bg-red-400/8 shadow-[0_0_30px_rgba(248,113,113,0.15)]",
                iconBg: "bg-red-500",
              },
              {
                icon: Activity,
                title: "Savings Opportunity",
                body: "Switching insurance plans could save you $720/yr.",
                color: "border-blue-400/40 bg-blue-400/8 shadow-[0_0_30px_rgba(96,165,250,0.15)]",
                iconBg: "bg-blue-500",
                iconText: true,
              },
            ].map((alert, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, type: "spring" }}
                className={`glass-card rounded-2xl p-5 border ${alert.color} backdrop-blur-xl hover-lift`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full ${alert.iconBg} text-white flex items-center justify-center flex-shrink-0 font-black`}>
                    {typeof alert.icon === "string" ? (
                      alert.icon
                    ) : (
                      <Activity className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-black text-white mb-1">{alert.title}</h4>
                    <p className="text-sm text-white/60 font-medium leading-relaxed">{alert.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARQUEE 3 ── */}
      <div className="w-full overflow-hidden py-8 bg-black text-primary border-y border-white/5 relative z-20">
        <div className="marquee-track-fast">
          {[...Array(20)].map((_, i) => (
            <span key={i} className="font-display font-black text-xl px-6 uppercase flex items-center gap-6 whitespace-nowrap text-white/20">
              Works While You Sleep
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              No Dashboard Needed
              <span className="w-2 h-2 rounded-full bg-primary/50 flex-shrink-0" />
            </span>
          ))}
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <section className="py-24 sm:py-32 lg:py-40 relative z-10 bg-[#0A0A1A] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
        </div>
        <div className="container mx-auto px-6 text-center relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display font-black text-[clamp(3.5rem,15vw,6.25rem)] md:text-[100px] leading-none uppercase mb-6 tracking-tighter"
          >
            Ready to feel
            <br />
            <span className="text-primary italic" style={{ textShadow: "0 0 80px rgba(198,255,0,0.5)" }}>
              Alive?
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 font-medium mb-12"
          >
            Join 8M+ users who stopped dreading their finances.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, type: "spring" }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              size="lg"
              className="group min-h-16 px-8 sm:px-12 text-base sm:text-xl font-black bg-primary text-black hover:bg-primary/90 rounded-[2rem] shadow-[0_0_60px_rgba(198,255,0,0.5)] hover:shadow-[0_0_90px_rgba(198,255,0,0.8)] transition-all hover:scale-105 w-full sm:w-auto"
            >
              Download for iOS <FaApple className="ml-3 w-6 h-6" />
            </Button>
            <Button
              size="lg"
              className="group min-h-16 px-8 sm:px-12 text-base sm:text-xl font-black bg-white/5 text-white border border-white/15 hover:bg-white/10 rounded-[2rem] transition-all w-full sm:w-auto"
              onClick={() => window.location.href = '/downloads/bodhi-v2.apk'}
            >
              Download for Android (v2) <FaGooglePlay className="ml-3 w-5 h-5" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
