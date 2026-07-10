import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

// Reached only via the link in a password-reset email. Supabase's client
// detects the recovery token in the URL on load and fires a
// PASSWORD_RECOVERY auth event once it's exchanged for a real (temporary)
// session — that's the signal this page is legitimately reachable, not
// just someone browsing here directly.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // If the tab already processed the recovery link before this listener
    // attached, a session will already be present — treat that as ready too.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated — you're signed in.");
    navigate("/dashboard");
  };

  return (
    <>
      <SEO title="Reset password — QuickServe" description="Set a new password for your QuickServe account." noIndex />
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 pattern-warm">
        <div className="w-full max-w-md">
          <Card className="shadow-warm border-border/60">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-coffee flex items-center justify-center">
                  <Coffee className="w-5 h-5 text-accent" />
                </div>
                <span className="font-display text-xl font-bold">QuickServe</span>
              </div>

              {!ready ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
                  Verifying your reset link…
                </div>
              ) : (
                <>
                  <h1 className="font-display text-3xl font-bold mb-1">Set a new password</h1>
                  <p className="text-muted-foreground text-sm mb-8">Choose a new password for your account.</p>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="password">New password</Label>
                      <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" />
                    </div>
                    <div>
                      <Label htmlFor="confirm">Confirm password</Label>
                      <Input id="confirm" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" className="mt-1.5" />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-11">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
