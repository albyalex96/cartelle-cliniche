-- CreateTable
CREATE TABLE "blocked_ips" (
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_ips_pkey" PRIMARY KEY ("ip")
);
