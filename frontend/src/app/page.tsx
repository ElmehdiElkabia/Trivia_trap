import LandingPage from "@/components/landing/landing";
import { getUser, UserApiError } from "@/lib/getUser";


export default async function Page() {
  let user = null;

  try {
    user = await getUser({});
  } catch (error) {
    if (!(error instanceof UserApiError) || error.status !== 401) throw error;
  }

  return <LandingPage user={user} />;
}
