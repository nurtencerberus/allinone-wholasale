import { getSessionUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/staff";
import { AdminNavTabs } from "@/components/admin/AdminNavTabs";

/** Admin tabs, limited to what the signed-in staff role may open. */
export async function AdminNav() {
  const user = await getSessionUser();
  return <AdminNavTabs permissions={permissionsFor(user?.role ?? "")} />;
}
