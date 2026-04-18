"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import {
  Users,
  Bot,
  Phone,
  Clock,
  Calendar,
  CreditCard,
  Zap,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface SetupStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  buttonLabel: string;
  isComplete: boolean;
}

export default function LaunchpadPage() {
  const brand = useBrand();
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSetupStatus() {
      try {
        const supabase = createClient();

        const [
          contactsResult,
          agentsResult,
          callsResult,
          campaignsResult,
          orgResult,
        ] = await Promise.all([
          supabase.from("contacts").select("id").limit(1),
          supabase.from("ai_agents").select("id").limit(1),
          supabase.from("calls").select("id").eq("status", "completed").limit(1),
          supabase.from("campaigns").select("id").limit(1),
          supabase.from("organizations").select("subscription_status, trial_ends_at").limit(1).maybeSingle(),
        ]);
        const contactsCount = contactsResult.data?.length || 0;
        const agentsCount = agentsResult.data?.length || 0;
        const callsCount = callsResult.data?.length || 0;
        const campaignsCount = campaignsResult.data?.length || 0;

        const subStatus = orgResult.data?.subscription_status;
        const trialEndsAt = orgResult.data?.trial_ends_at;
        const hasActiveSub =
          subStatus === "active" ||
          subStatus === "trialing" ||
          (!!trialEndsAt && new Date(trialEndsAt) > new Date());

        const setupSteps: SetupStep[] = [
          {
            id: 1,
            title: "Add your first contact",
            description: "Import or create your first lead to get started",
            icon: Users,
            href: "/people",
            buttonLabel: "Add Contact",
            isComplete: (contactsCount || 0) > 0,
          },
          {
            id: 2,
            title: "Configure your AI agent",
            description: "Set up an AI agent to automate your outreach",
            icon: Bot,
            href: "/ai-agents/build",
            buttonLabel: "Build Agent",
            isComplete: (agentsCount || 0) > 0,
          },
          {
            id: 3,
            title: "Set your business hours",
            description: "Define when your AI agent should be active",
            icon: Clock,
            href: "/settings",
            buttonLabel: "Set Hours",
            isComplete: false,
          },
          {
            id: 4,
            title: "Connect your calendar",
            description: "Sync your calendar for better scheduling",
            icon: Calendar,
            href: "/calendar",
            buttonLabel: "Connect",
            isComplete: false,
          },
          {
            id: 5,
            title: "Choose your plan",
            description: "Select a plan to unlock AI calling and campaigns",
            icon: CreditCard,
            href: "/billing",
            buttonLabel: "View Plans",
            isComplete: false,
          },
          {
            id: 6,
            title: "Create your first campaign",
            description: "Launch an automated outreach campaign",
            icon: Zap,
            href: "/campaigns",
            buttonLabel: "Create Campaign",
            isComplete: (campaignsCount || 0) > 0,
          },
          {
            id: 7,
            title: "Make your first AI call",
            description: "Test your AI agent with a real call",
            icon: Phone,
            href: "/ai-agents",
            buttonLabel: "Make Call",
            isComplete: (callsCount || 0) > 0,
          },
        ];

        setSteps(hasActiveSub ? setupSteps.filter((s) => s.id !== 5) : setupSteps);
      } catch (error) {
        console.error("Error fetching setup status:", error);
        setSteps([
          { id: 1, title: "Add your first contact", description: "Import or create your first lead to get started", icon: Users, href: "/people", buttonLabel: "Add Contact", isComplete: false },
          { id: 2, title: "Configure your AI agent", description: "Set up an AI agent to automate your outreach", icon: Bot, href: "/ai-agents/build", buttonLabel: "Build Agent", isComplete: false },
          { id: 3, title: "Set your business hours", description: "Define when your AI agent should be active", icon: Clock, href: "/settings", buttonLabel: "Set Hours", isComplete: false },
          { id: 4, title: "Connect your calendar", description: "Sync your calendar for better scheduling", icon: Calendar, href: "/calendar", buttonLabel: "Connect", isComplete: false },
          { id: 5, title: "Choose your plan", description: "Select a plan to unlock AI calling and campaigns", icon: CreditCard, href: "/billing", buttonLabel: "View Plans", isComplete: false },
          { id: 6, title: "Create your first campaign", description: "Launch an automated outreach campaign", icon: Zap, href: "/campaigns", buttonLabel: "Create Campaign", isComplete: false },
          { id: 7, title: "Make your first AI call", description: "Test your AI agent with a real call", icon: Phone, href: "/ai-agents", buttonLabel: "Make Call", isComplete: false },
        ]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSetupStatus();
  }, []);

  const completedSteps = steps.filter((s) => s.isComplete).length;
  const totalSteps = steps.length;
  const progressPercentage =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const isAllComplete = completedSteps === totalSteps;

  // Find the first incomplete step to know which is "active"
  const firstIncompleteId = steps.find((s) => !s.isComplete)?.id ?? -1;

  // SVG Circle Progress Indicator
  const circleRadius = 45;
  const circumference = 2 * Math.PI * circleRadius;
  const offset = circumference - (progressPercentage / 100) * circumference;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-4 text-zinc-400">Loading your setup checklist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Welcome to {brand.brandName}!</h1>
            <p className="mt-2 text-lg text-zinc-400">
              Here&apos;s your personalized setup guide
            </p>
          </div>

          {/* Progress Circle */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-24 w-24">
              <svg
                className="h-24 w-24 -rotate-90 transform"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r={circleRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-zinc-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={circleRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="text-indigo-600 transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold text-white">
                  {progressPercentage}%
                </div>
                <div className="text-xs text-zinc-400">
                  {completedSteps}/{totalSteps}
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-zinc-500">Steps Complete</p>
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step) => {
          const isChoosePlan = step.id === 5;
          const isActiveChoosePlan = isChoosePlan && !step.isComplete && firstIncompleteId === step.id;

          return (
            <div
              key={step.id}
              className={cn(
                "rounded-xl border p-4 transition-all",
                step.isComplete
                  ? "border-zinc-800 bg-zinc-900/50"
                  : isActiveChoosePlan
                    ? "border-indigo-500/50 bg-indigo-500/5 hover:border-indigo-500/70"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-indigo-500/50"
              )}
            >
              <div className="flex items-start gap-4">
                {/* Left Circle - Status Indicator */}
                <div className="mt-1 flex-shrink-0">
                  {step.isComplete ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                  ) : isActiveChoosePlan ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-500 bg-indigo-500/10">
                      <CreditCard className="h-5 w-5 text-indigo-400" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-700 bg-zinc-800">
                      <span className="text-sm font-semibold text-zinc-400">
                        {step.id}
                      </span>
                    </div>
                  )}
                </div>

                {/* Middle Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h3 className={cn(
                        "font-semibold",
                        isActiveChoosePlan ? "text-indigo-200" : "text-white"
                      )}>{step.title}</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        {step.description}
                      </p>
                    </div>

                    {/* Right CTA Button */}
                    <div className="flex-shrink-0">
                      <Link
                        href={step.href}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                          step.isComplete
                            ? "border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
                            : isActiveChoosePlan
                              ? "bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                        )}
                      >
                        {step.isComplete ? (
                          <>
                            <span>Completed</span>
                            <CheckCircle2 className="h-4 w-4" />
                          </>
                        ) : (
                          <>
                            {step.buttonLabel}
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA Section */}
      {isAllComplete ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-8 text-center">
          <div className="flex justify-center mb-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">You&apos;re all set!</h2>
          <p className="mt-2 text-emerald-200">
            You&apos;ve completed all setup steps. Your full 14-day trial is now
            active and ready to use.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-600/10 p-8 text-center">
          <p className="text-lg font-semibold text-white">
            Complete setup to unlock your full 14-day trial.
          </p>
          <p className="mt-2 text-indigo-200">
            You&apos;re {totalSteps - completedSteps} step{totalSteps - completedSteps !== 1 ? "s" : ""} away
            from full access.
          </p>
        </div>
      )}
    </div>
  );
}
