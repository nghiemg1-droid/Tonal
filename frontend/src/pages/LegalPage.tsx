import type { ReactNode } from 'react'
import { APP_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../lib/config'
import Logo from '../components/Logo'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink/90">{children}</div>
    </section>
  )
}

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand underline">
    {CONTACT_EMAIL}
  </a>
)

function Privacy() {
  return (
    <>
      <Section title="The short version">
        <p>
          {APP_NAME} is a small personal project. We collect only what the app needs to work, we never
          sell your data, and there are no ads. You can delete your account and everything in it at any
          time from your profile.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Account:</b> your email address and password (the password is stored only as a secure hash
            by our login provider), or your phone number if you log in by phone. Your phone number is used
            only to send you login codes and is never shown to other users.
          </li>
          <li>
            <b>Profile:</b> username, display name and profile photo.
          </li>
          <li>
            <b>What you share:</b> voice posts, photos, short videos (with the edits and music you pick),
            drawings, captions, comments, likes, follows, stories, and Line Check reports.
          </li>
          <li>
            <b>Messages:</b> the text, voice messages, photos, drawings, stickers, reactions and files you
            send in chats, plus when you last read a chat (for "Seen").
          </li>
          <li>
            <b>Activity needed for features:</b> who viewed your stories, who opened a view-once photo,
            accounts you block, and reports you send.
          </li>
        </ul>
        <p>
          We do <b>not</b> collect your location. Photos are re-drawn in your browser before upload, which
          removes hidden data such as GPS coordinates. Phones can also hide where a video was filmed inside
          the video file; we remove that location data in your browser before a video is uploaded. We don't use advertising cookies. To improve the app
          we use privacy-friendly product analytics (which pages and features are used, linked to an
          anonymous account id, not your email). When you record a voice clip in some browsers (like
          Chrome), the browser's own speech service turns your words into a transcript; it's saved with the
          clip so others can read it.
        </p>
      </Section>

      <Section title="Who can see what">
        <ul className="list-disc space-y-1 pl-5">
          <li>Posts, comments, profiles and stories are visible to other logged-in users.</li>
          <li>
            Messages are visible only to the people in that chat. Photos and files in chats are stored
            privately and shown through links that expire after one hour.
          </li>
          <li>
            View-once photos can be opened one time by each person in the chat. After everyone has opened
            it, the file is deleted.
          </li>
          <li>Stories disappear from the app after 24 hours.</li>
          <li>Blocking someone hides your posts and stories from each other and stops their messages.</li>
          <li>Reports are seen only by the person running {APP_NAME}, never by the reported user.</li>
          <li>
            <b>Line Check</b> reports are anonymous: other users see the place, how busy it is, your note and
            the time, never your name. We keep who sent a report only so you can delete it and so we can act
            on abuse. Reports disappear after 1 hour and are deleted for good after 1 day.
          </li>
          <li>
            <b>Campus Drop</b> and <b>Guess the Spot</b> posts are normal posts: the same people who can see
            your other posts can see them. You never have to show where you are.
          </li>
          <li>
            <b>Posting streaks:</b> we keep which days you posted (just the dates) to count your streak.
            Others can see your streak bean, badges and the Hall of Fame list unless you turn on “Hide my
            streak”. Private accounts are never listed in the Hall of Fame.
          </li>
          <li>
            Files in posts and stories are stored at long, hard-to-guess links. Anyone who is given such a
            link can open that one file, so think before sharing links outside {APP_NAME}.
          </li>
        </ul>
        <p>
          Anyone who sees your content could still take a screenshot or save it. Please only share what
          you're comfortable with.
        </p>
      </Section>

      <Section title="Services we use">
        <p>
          Your data is stored with <b>Supabase</b> (database, login and file storage) and the website is
          served by our hosting provider. These companies process data only to run the app for us.
          Messages and posts are not end-to-end encrypted, but they are sent over secure (HTTPS)
          connections and protected by access rules in the database.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          We keep your data while your account exists. When you delete your account (Profile → Delete
          account), your profile, posts, comments, likes, follows, stories, messages you sent and your
          files are permanently deleted. Messages that other people sent to you stay in their chats.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can edit your profile, delete posts, comments, stories and messages, block people, and delete
          your account at any time. To ask for a copy of your data or for help, email {mail}.
        </p>
      </Section>

      <Section title="Age">
        <p>
          {APP_NAME} is not meant for children under 13, and we don't knowingly collect data from them. If
          you believe a child under 13 has an account, contact us and we'll delete it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy, we'll update the date at the top of this page. Big changes will also be
          shown in the app.
        </p>
      </Section>
    </>
  )
}

function Terms() {
  return (
    <>
      <Section title="Using Tonal">
        <p>
          By creating an account you agree to these terms and to our{' '}
          <a href="/privacy" className="text-brand underline">
            Privacy Policy
          </a>
          . You must be at least 13 years old. Keep your password safe; you're responsible for what happens
          on your account.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          You own what you post. By posting, you allow {APP_NAME} to store and show it to other users so the
          app can work. You can delete your content at any time.
        </p>
      </Section>

      <Section title="Be kind">
        <p>Don't post or send anything that:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>bullies, harasses or threatens someone;</li>
          <li>is hateful, sexually explicit, or shows violence;</li>
          <li>is spam, a scam, or pretends to be someone else;</li>
          <li>you don't have the right to share, or that breaks the law.</li>
        </ul>
        <p>
          Use Report and Block when something is wrong. We may remove content or accounts that break these
          rules.
        </p>
      </Section>

      <Section title="No guarantees">
        <p>
          {APP_NAME} is a student project provided "as is". It may change, have bugs, or stop running, and
          content could be lost. Please keep copies of anything important.
        </p>
      </Section>

      <Section title="Contact">
        <p>Questions? Email {mail}.</p>
      </Section>
    </>
  )
}

export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use'
  return (
    <article className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-line bg-card p-6 md:p-8">
      <header className="flex items-center gap-3">
        <a href="/" aria-label={`${APP_NAME} home`}>
          <Logo className="h-10 w-10" />
        </a>
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          <p className="text-xs text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
        </div>
      </header>
      {kind === 'privacy' ? <Privacy /> : <Terms />}
    </article>
  )
}
