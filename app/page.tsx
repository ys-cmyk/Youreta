import { redirect } from "next/navigation";

export default function Home() {
  // Middleware already gates auth; signed-in users land on the events list.
  redirect("/events");
}
