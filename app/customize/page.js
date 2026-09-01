import { redirect } from "next/navigation";

export default function Customize() {
  redirect("/app?tab=wardrobe");
}
