import { redirect } from "next/navigation";

export default async function ProjectSettingsJwtKeysPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/client/projects/${id}/project-settings?tab=jwt-keys`);
}
