import { getRequestSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./_components/login-form";

export default async function LoginPage() {
    const session = await getRequestSession();
    if (session) redirect("/workspace");
    return <LoginForm />;
}
