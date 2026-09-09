"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteTeamMember, updateTeamMemberRole } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Loader2, UserPlus, Lock } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/plans";
import type { CompanyPlan, Profile, UserRole } from "@/lib/types";

export function TeamPanel({
  members,
  isAdmin,
  currentUserId,
  plan,
}: {
  members: Profile[];
  isAdmin: boolean;
  currentUserId: string;
  plan: CompanyPlan;
}) {
  const router = useRouter();
  const canInvite = PLAN_LIMITS[plan].crewSeats;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("estimator");
  const [inviting, setInviting] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      await inviteTeamMember(email.trim(), role);
      toast.success(`Invited ${email}`);
      setEmail("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: UserRole) {
    try {
      await updateTeamMemberRole(memberId, newRole);
      toast.success("Role updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Admins see billing and pricing. Estimators can only create and manage quotes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdmin && !canInvite && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
            <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              Crew seats are a Pro feature.{" "}
              <Link href="/pricing" className="font-medium text-primary underline">
                Upgrade to Pro
              </Link>{" "}
              to invite teammates.
            </p>
          </div>
        )}
        {isAdmin && canInvite && (
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="inviteEmail">Invite by email</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="crew@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="estimator">Estimator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="lg" disabled={inviting} className="gap-2">
              {inviting ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              Invite
            </Button>
          </form>
        )}

        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {m.full_name || m.email}
                  {m.id === currentUserId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </p>
                <p className="text-sm text-muted-foreground">{m.email}</p>
              </div>
              {isAdmin && m.id !== currentUserId ? (
                <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v as UserRole)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="estimator">Estimator</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="capitalize">
                  {m.role}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
