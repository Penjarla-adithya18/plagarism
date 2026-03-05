import Link from 'next/link'
import { Briefcase, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Terms and Conditions | HyperLocal Jobs',
  description: 'Terms and Conditions for using the HyperLocal Jobs platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/signup" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-gray-600 dark:text-slate-400">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">HyperLocal Jobs</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 pb-20">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms and Conditions</h1>
        <p className="text-sm text-gray-500 dark:text-slate-500 mb-8">
          Last updated: 28 February 2026 &nbsp;&middot;&nbsp; Effective immediately
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-slate-300">

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account on HyperLocal Jobs (&ldquo;Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) operated by HyperLocal Technologies Pvt. Ltd., you (&ldquo;User&rdquo;, &ldquo;Worker&rdquo;, &ldquo;Employer&rdquo;) agree to be bound by these Terms and Conditions and all applicable laws and regulations of the Republic of India. If you do not agree with any part of these terms, you must not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">2. Platform Description</h2>
            <p>HyperLocal Jobs is a digital marketplace connecting blue-collar and gig workers (&ldquo;Workers&rdquo;) with local businesses and individuals (&ldquo;Employers&rdquo;) seeking short-term, part-time, full-time, or gig-based employment. The Platform facilitates job discovery, applications, communication, and secure escrow-based payments. We are an intermediary and not a party to the employment contract between Workers and Employers.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">3. Eligibility</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You must be at least 18 years of age to register as a Worker or Employer.</li>
              <li>You must be legally authorised to work in India.</li>
              <li>By registering, you confirm all information provided is accurate, truthful, and up to date.</li>
              <li>You agree to keep your account credentials confidential and notify us immediately of any unauthorised access.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">4. Account Registration &amp; Identity Verification</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>A valid Indian mobile number and/or email address is required for registration.</li>
              <li>Identity verification via PAN card may be required for escrow payments and the verified badge.</li>
              <li>Providing a false PAN or misrepresenting identity will result in immediate account suspension and may be reported to law enforcement.</li>
              <li>Each person or business entity may maintain only one active account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">5. Worker Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Workers must accurately represent their skills, experience, availability, and qualifications in their profile.</li>
              <li>Workers are responsible for attending accepted jobs on time and fulfilling the agreed scope of work.</li>
              <li>Workers must not share contact details with Employers before an application is accepted, to prevent off-platform hiring.</li>
              <li>Workers are independent contractors, not employees of HyperLocal Jobs, and are responsible for their own taxes and insurance.</li>
              <li>Workers must not engage in fraudulent, aggressive, or harassing behaviour toward Employers or other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">6. Employer Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Employers must post accurate and genuine job listings. Fake, misleading, or fraudulent listings are strictly prohibited.</li>
              <li>Employers must not request any fee, deposit, or personal financial information from Workers as a condition of employment.</li>
              <li>Employers must comply with all applicable Indian labour laws, including the Minimum Wages Act, 1948 and the Code on Wages, 2019.</li>
              <li>Employers must respect Workers&apos; dignity and must not engage in discrimination on the basis of caste, religion, gender, disability, or regional origin.</li>
              <li>Employers who use escrow must fund it before the Worker begins work.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">7. Prohibited Activities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Posting or soliciting adult content, illegal work, or activities that violate any law.</li>
              <li>Requesting advance payments, registration fees, or security deposits from Workers.</li>
              <li>Sharing private contact information to bypass the Platform&apos;s communication system.</li>
              <li>Using automated bots, scrapers, or scripts to access the Platform.</li>
              <li>Creating multiple accounts to circumvent bans or restrictions.</li>
              <li>Using abusive, casteist, sexist, or threatening language in any communication.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">8. Escrow Payments</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Employers pre-fund the escrow before the job begins. Funds are held securely by the Platform.</li>
              <li>Payment is released to the Worker once the Employer confirms work completion, or automatically after a 48-hour dispute window.</li>
              <li>Disputes must be raised within 48 hours of job completion.</li>
              <li>A platform service fee of up to 5% may be deducted from escrow transactions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">9. AI Features &amp; Matching</h2>
            <p>The Platform uses AI algorithms to recommend jobs to Workers and rank candidates for Employers. These recommendations are based on skill matching (including synonym-aware matching for terms like chef/cook, watchman/guard, driver/chauffeur, maid/bai, etc.), location, availability, and experience. AI scores are advisory only and are not guarantees of employment or hiring.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">10. Ratings &amp; Reviews</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Both Workers and Employers may rate each other after job completion.</li>
              <li>Ratings must be honest and based on genuine experience. Fabricated or retaliatory reviews are prohibited.</li>
              <li>The Platform reserves the right to remove reviews that violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">11. Intellectual Property</h2>
            <p>All Platform content, branding, code, and design are the intellectual property of HyperLocal Technologies Pvt. Ltd. Users retain ownership of content they upload but grant the Platform a non-exclusive licence to display and process it to provide services.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">12. Account Termination</h2>
            <p>We reserve the right to suspend or permanently terminate any account that violates these Terms, engages in fraud, or poses a risk to other users, without prior notice. Users may delete their accounts at any time from the Profile settings page.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">13. Platform Intermediary Disclaimer &amp; Safe-Harbour</h2>
            <p className="mb-3">By using this Platform, you acknowledge and agree that HyperLocal Jobs acts solely as a digital intermediary that enables Workers and Managers (Employers) to connect virtually.</p>
            <p className="mb-3">Submission of an application or profile does not guarantee employment, hiring, or job allocation by any Manager. All recruitment decisions are made exclusively by the Manager, and the Platform has no involvement in such decisions.</p>
            <p className="mb-3">Any disputes, conflicts, payments, or employment-related issues arising between a Worker and a Manager shall be resolved directly between those parties, and the Platform shall bear no responsibility or liability for such matters. The Platform only facilitates communication and networking between users and does not act as an employer, contractor, or mediator.</p>
            <p>This condition is protected under <strong>Section 79 of the Information Technology Act, 2000</strong>, which grants safe-harbour protection to intermediaries, stating that an intermediary is not liable for third-party information, communication, or interactions hosted on its platform when it merely provides access to a communication system without controlling the transaction.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">14. Limitation of Liability</h2>
            <p>The Platform is provided on an &ldquo;as is&rdquo; basis. To the maximum extent permitted by Indian law, HyperLocal Technologies Pvt. Ltd. shall not be liable for any indirect, incidental, or consequential damages arising from use of the Platform, including disputes between Workers and Employers, missed work opportunities, or payment failures caused by third-party gateways.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">15. Grievance Redressal</h2>
            <p>In accordance with the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, users may raise grievances by contacting:</p>
            <address className="not-italic mt-2 bg-gray-100 dark:bg-slate-800 rounded-lg p-3 text-sm">
              <strong>HyperLocal Technologies Pvt. Ltd.</strong><br />
              Email: <a href="mailto:support@hyperlocal.in" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@hyperlocal.in</a><br />
              Response time: Within 72 hours
            </address>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">16. Governing Law &amp; Jurisdiction</h2>
            <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts located in Hyderabad, Telangana, India.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">17. Amendments</h2>
            <p>We may update these Terms from time to time. We will notify registered users of material changes via their registered mobile number or email at least 7 days before the changes take effect. Continued use after the effective date constitutes acceptance of the updated Terms.</p>
          </section>

          <div className="border-t border-gray-200 dark:border-slate-700 pt-6 text-xs text-gray-500 dark:text-slate-500">
            By creating an account, you acknowledge that you have read, understood, and agreed to these Terms and Conditions.<br />
            Also see:{' '}
            <Link href="/privacy" className="text-emerald-600 dark:text-emerald-400 hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}