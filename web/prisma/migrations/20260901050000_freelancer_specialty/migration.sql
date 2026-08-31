-- CreateTable
CREATE TABLE "FreelancerSpecialty" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shiftRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreelancerSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreelancerSpecialty_specialtyId_idx" ON "FreelancerSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerSpecialty_freelancerId_specialtyId_key" ON "FreelancerSpecialty"("freelancerId", "specialtyId");

-- AddForeignKey
ALTER TABLE "FreelancerSpecialty" ADD CONSTRAINT "FreelancerSpecialty_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerSpecialty" ADD CONSTRAINT "FreelancerSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
