import { redirect } from 'next/navigation'

export default function RootPage() {
  // Redirect to inventory page immediately
  redirect('/inventory')
}