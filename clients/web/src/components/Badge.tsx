import type { Status } from "../lib/types";
import { badgeClass } from "../lib/format";

// Mirrors the template's <span class="badge badge-*">{{ status }}</span>.
export default function Badge({ status }: { status: Status }) {
  return <span className={`badge ${badgeClass(status)}`}>{status}</span>;
}
