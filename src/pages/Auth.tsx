import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Coffee, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { getAppOrigin } from "@/lib/site";

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Always show the same success state whether or not the email is
    // actually registered — confirming/denying an account's existence
    // here would let anyone probe for valid signup emails.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppOrigin()}/auth/reset-password`,
    });
    setResetSent(true);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${getAppOrigin()}/onboarding` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Welcome to QuickWaiterz! Let's set up your business.");
          navigate("/onboarding");
        } else {
          toast.success("Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        // Check if user has business
        const { data: biz } = await supabase.from("businesses").select("id").limit(1).maybeSingle();
        navigate(biz ? "/dashboard" : "/onboarding");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO title={`${mode === "signup" ? "Sign up" : mode === "forgot" ? "Reset password" : "Sign in"} — QuickWaiterz`} description="Sign in to your QuickWaiterz account." noIndex />
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 pattern-warm">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 mb-8 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <Card className="shadow-warm border-border/60">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-coffee flex items-center justify-center">
                  <Coffee className="w-5 h-5 text-accent" />
                </div>
                <span className="font-display text-xl font-bold">QuickWaiterz</span>
              </div>
              {mode === "forgot" ? (
                <>
                  <h1 className="font-display text-3xl font-bold mb-1">Reset your password</h1>
                  <p className="text-muted-foreground text-sm mb-8">
                    Enter your email and we'll send you a link to set a new password.
                  </p>

                  {resetSent ? (
                    <div className="text-sm bg-secondary/10 text-secondary rounded-lg p-4">
                      If an account exists for that email, a reset link is on its way — check your inbox.
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" className="mt-1.5" />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-11">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
                      </Button>
                    </form>
                  )}

                  <div className="mt-6 text-center text-sm text-muted-foreground">
                    <button
                      onClick={() => { setMode("signin"); setResetSent(false); }}
                      className="text-secondary font-semibold hover:underline"
                    >
                      Back to sign in
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="font-display text-3xl font-bold mb-1">
                    {mode === "signup" ? "Start your free trial" : "Welcome back"}
                  </h1>
                  <p className="text-muted-foreground text-sm mb-8">
                    {mode === "signup" ? "14 days free. No credit card required." : "Sign in to your dashboard."}
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" className="mt-1.5" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => setMode("forgot")}
                            className="text-xs text-secondary hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-11">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signup" ? "Create Account" : "Sign In"}
                    </Button>
                  </form>

                  <div className="mt-6 text-center text-sm text-muted-foreground">
                    {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
                    <button
                      onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                      className="text-secondary font-semibold hover:underline"
                    >
                      {mode === "signup" ? "Sign in" : "Sign up free"}
                    </button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
