import { supabase } from '../lib/supabase'
import ProfileEditor from '../components/ProfileEditor'

export default function ProfilePage({ userId }: { userId: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ProfileEditor userId={userId} />
      <button
        onClick={() => supabase.auth.signOut()}
        className="rounded-full border border-line px-5 py-2 text-ink hover:bg-card active:scale-95 transition"
      >
        Log out
      </button>
    </div>
  )
}