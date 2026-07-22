import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StartggUrlForm } from "@/components/startgg-url-form";
import { updateStartggUrl, updateUsername } from "./actions";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Discord (top right) to manage your settings.
        </p>
      </main>
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, startggUrl: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle />

      <Card className="mt-8">
        <CardContent className="pt-4">
          <UsernameForm defaultValue={me?.username ?? ""} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StartggUrlForm
            action={updateStartggUrl}
            defaultValue={me?.startggUrl ?? ""}
            label="start.gg profile"
            description="Self-declared — link your start.gg profile so others can look up your results."
          />
        </CardContent>
      </Card>
    </main>
  );
}

function PageTitle() {
  return (
    <div className="flex items-center gap-2">
      <Settings className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
    </div>
  );
}

function UsernameForm({ defaultValue }: { defaultValue: string }) {
  async function action(formData: FormData) {
    "use server";
    await updateUsername(String(formData.get("username") ?? ""));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Username
        <span className="text-xs font-normal text-muted-foreground">
          Shown everywhere on the site instead of your Discord name — handy if they don&apos;t
          match.
        </span>
        <input
          name="username"
          type="text"
          required
          maxLength={32}
          defaultValue={defaultValue}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
