import UserSearch from '../components/UserSearch'

export default function SearchPage({ userId }: { userId: string }) {
  return <UserSearch userId={userId} />
}