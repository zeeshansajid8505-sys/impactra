import { redirect } from 'next/navigation';

export default function PullRequestsRedirectPage() {
  redirect('/workspace/changes');
}
