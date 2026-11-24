import type { Metadata } from 'next';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { PageTitle } from '@/components/ui';
import { SavedJobList } from '@/components/SavedJobs';

export const metadata: Metadata = { title: 'งานที่บันทึก' };

export default function SavedPage() {
  return (
    <>
      <PublicHeader />
      <main className="container page">
        <PageTitle title="งานที่บันทึก" sub="เก็บไว้ในเครื่องนี้ บริษัทไม่เห็น" />
        <SavedJobList />
      </main>
      <Footer />
    </>
  );
}
