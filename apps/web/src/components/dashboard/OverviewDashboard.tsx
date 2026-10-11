'use client';

import { useState } from 'react';
import { HeroSection } from './HeroSection';
import { ChangePipelineVisual } from './ChangePipelineVisual';
import { DigitalTwinMap } from './DigitalTwinMap';
import { ReleaseSafetySection } from './ReleaseSafetySection';
import { AnalysisCapabilities } from './AnalysisCapabilities';
import { RecentChangesSection } from './RecentChangesSection';
import { ExplanatoryModal, ExplanatoryModalType } from '../shared/ExplanatoryModal';

export function OverviewDashboard() {
  const [modalType, setModalType] = useState<ExplanatoryModalType>(null);

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* 1. Hero & Statement Section */}
      <HeroSection onOpenModal={(type) => setModalType(type)} />

      {/* 2. Distinctive Pipeline Concept: How Impactra Sees a Change */}
      <ChangePipelineVisual />

      {/* 3. Software Digital Twin: Architectural Dependency Map */}
      <DigitalTwinMap />

      {/* 4. Release Safety Engine: Open Typographic Layout */}
      <ReleaseSafetySection />

      {/* 5. Continuous Change Analyzers */}
      <AnalysisCapabilities />

      {/* 6. Recent Changes & Ingestion Stream */}
      <RecentChangesSection onOpenModal={(type) => setModalType(type)} />

      {/* Explanatory Roadmap Modal */}
      <ExplanatoryModal
        type={modalType}
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
      />
    </div>
  );
}
