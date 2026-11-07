import { ArrowRight, BookOpen, HeartHandshake, Leaf, Utensils } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import schoolLunchPhoto from '../assets/school-lunch.jpg';
import { useAuth } from '../contexts/AuthContext';

export const LandingPage = () => {
  const { user, loading } = useAuth();

  if (user) return <Navigate to="/admin" replace />;

  return (
    <main className="min-h-screen overflow-x-clip bg-[#fbfaf7] text-slate-900">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
        <Link to="/" className="flex items-center gap-3" aria-label="School Feeding home">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold leading-tight tracking-tight sm:text-base">
            School Feeding
            <span className="block text-xs font-medium text-slate-500">Management System</span>
          </span>
        </Link>

        <Link
          to="/login"
          className="rounded-full border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-700 hover:text-emerald-800"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-8 sm:px-10 sm:pb-24 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-12">
        <div className="relative z-10 max-w-xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <HeartHandshake className="h-4 w-4" />
            Simple school lunch payments
          </div>

          <h1 className="text-5xl font-extrabold leading-[1.06] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Lunch payments,
            <span className="mt-2 block text-emerald-700">clear and tracked</span>
            <span className="block">in one place.</span>
          </h1>

          <p className="mt-7 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Record every payment, see who has paid and who still owes, and let AI
            help with summaries, checks and reminders. Your staff stay in control.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-700 px-7 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-800"
            >
              Get started
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#how-it-helps"
              className="inline-flex items-center justify-center rounded-full px-7 py-4 text-base font-semibold text-slate-700 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              See how it works
            </a>
          </div>

          <div id="how-it-helps" className="mt-12 grid scroll-mt-8 max-w-lg grid-cols-2 gap-4 border-t border-slate-200 pt-7">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Utensils className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-800">Clear payment tracking</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">See who has paid and who still owes.</span>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-800">
                <Leaf className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-800">AI-assisted insights</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Review summaries and reminders before acting.</span>
              </span>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div className="absolute -left-7 top-12 h-32 w-32 rounded-full bg-amber-200/70 blur-3xl" />
          <div className="absolute -bottom-8 -right-4 h-40 w-40 rounded-full bg-emerald-200/70 blur-3xl" />
          <div className="relative aspect-[1.2/1] overflow-hidden rounded-[2rem] bg-emerald-100 shadow-2xl shadow-emerald-950/15 sm:aspect-[1.32/1] lg:aspect-[1.12/1]">
            <img
              src={schoolLunchPhoto}
              alt="School children enjoying a healthy lunch together"
              className="landing-hero-image absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/5" />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 sm:bottom-7 sm:left-7 sm:right-7">
              <div className="max-w-xs text-white drop-shadow">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Nourish · Learn · Grow</p>
                <p className="mt-2 text-xl font-bold leading-tight sm:text-2xl">A shared meal can make a world of difference.</p>
              </div>
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md sm:flex">
                <HeartHandshake className="h-6 w-6" />
              </span>
            </div>
          </div>
          <div className="absolute -bottom-5 left-5 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur sm:-left-7 sm:bottom-8 sm:px-5 sm:py-4">
            <p className="text-xs font-medium text-slate-500">Better meals</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-800 sm:text-base">Brighter school days</p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 pb-7 text-center text-xs text-slate-400 sm:px-10 lg:px-12">
        Supporting healthy students and thriving school communities.
      </footer>

      {loading && <span className="sr-only" aria-live="polite">Checking your sign-in status</span>}
    </main>
  );
};
