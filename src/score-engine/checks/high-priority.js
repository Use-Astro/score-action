// Ported verbatim from Astro-Website/services/score-api/src/checks/high-priority.js.
// All check signatures, regexes, and details strings must stay byte-identical
// to the source so the Action and the web scanner classify the same code the
// same way. If a check changes here, change it in the source first and copy.

// Check 1: JWT in localStorage
export function checkJwtInLocalStorage(ctx) {
  const explicitStorageMatches = ctx.grepSourceFiles(/localStorage\.(setItem|getItem)\s*\(\s*['"`].*token/i);
  const implicitAuthStorageMatches = ctx.grepSourceFiles(
    /createBrowserClient\s*\(|createClient\s*\([\s\S]{0,400}?autoRefreshToken\s*:\s*true|firebase\.auth\s*\(\)\.onAuthStateChanged\s*\(|setPersistence\s*\([\s\S]{0,200}?browserLocalPersistence|initializeAuth\s*\([\s\S]{0,200}?browserLocalPersistence|pb\.authStore|LocalAuthStore|new PocketBase\s*\(/i,
  );
  const matches = [...new Set([...explicitStorageMatches, ...implicitAuthStorageMatches])];
  return {
    passed: matches.length === 0,
    details: matches.length > 0
      ? "Auth tokens stored in localStorage are accessible to any injected script (XSS)."
      : "No localStorage token storage detected.",
  };
}

// Check 2: No environment separation / hardcoded secrets
export function checkNoEnvSeparation(ctx) {
  const hasEnvExample = ctx.hasFile(".env.example") || ctx.hasFile(".env.local.example") || ctx.findFiles("**/.env.example").length > 0;
  const hasEnvValidation = ctx.hasAnyDep(["@t3-oss/env-nextjs", "@t3-oss/env-core", "envalid", "dotenv-safe"]);
  const hasJoiEnvValidation = ctx.grepSourceFiles(/Joi\.object\s*\(\s*\{[\s\S]{0,500}?(?:NODE_ENV|DATABASE_URL|PORT|API_KEY)/i).length > 0;
  const hasEnvConfig = ctx.grepSourceFiles(/ConfigModule\.forRoot|registerAs\s*\(\s*['"]|envSchema/).length > 0;

  if (hasEnvExample || hasEnvValidation || hasJoiEnvValidation || hasEnvConfig) {
    return { passed: true, details: "Environment configuration separation found." };
  }

  const secretScanExcludePatterns = /\.spec\.[jt]sx?$|\.test\.[jt]sx?$|__tests__|fixtures?\/|examples?\/|Dockerfile|docker-compose|\.md$/;
  const secretPattern = /(?:sk_live_[A-Za-z0-9]{16,}|pk_live_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}|(?:mongodb\+srv|postgres|mysql):\/\/[^"'\s:@]+:[^"'\s:@]+@)/g;
  const placeholderPattern = /example|placeholder|changeme|replace[-_\s]?me|your[_-\s]?(?:api|app|secret|token|key|password)|<[^>]+>|xxx+|localhost|127\.0\.0\.1|dummy|test|fake|mock|sample/i;
  const hardcodedSecrets = ctx.files.filter(
    (f) => {
      if (!ctx.isSourceFile(f.relativePath) || secretScanExcludePatterns.test(f.relativePath)) {
        return false;
      }

      const secretMatches = f.content.match(secretPattern) ?? [];
      return secretMatches.some((match) => !placeholderPattern.test(match));
    },
  );

  if (hardcodedSecrets.length > 0) {
    return {
      passed: false,
      details: "Secrets hardcoded in source. Can't deploy to staging/prod separately. One leaked key = full breach.",
    };
  }

  return {
    passed: false,
    details: "No .env.example or environment validation found. Environment separation is missing.",
  };
}

// Check 3: No test files
export function checkNoTestFiles(ctx) {
  const testFiles = ctx.findFiles("**/*.test.*")
    .concat(ctx.findFiles("**/*.spec.*"))
    .concat(ctx.findFiles("**/__tests__/**"))
    .concat(ctx.findFiles("test/**"))
    .concat(ctx.findFiles("tests/**"));

  const hasCypress = ctx.hasFile("cypress/**") || ctx.hasFile("**/cypress/**");
  const hasPlaywright = ctx.hasFile("playwright/**") || ctx.hasFile("e2e/**") || ctx.hasFile("**/e2e/**");

  if (testFiles.length > 0 || hasCypress || hasPlaywright) {
    return { passed: true, details: `${testFiles.length} test file(s) found.` };
  }

  const testScript = ctx.packageJson?.scripts?.test;
  if (testScript && !testScript.includes('echo "Error') && testScript !== "echo \"Error: no test specified\" && exit 1") {
    return { passed: true, details: "Test script configured in package.json." };
  }

  const srcFiles = ctx.files.filter((f) => /\.[jt]sx?$/.test(f.relativePath) && ctx.isSourceFile(f.relativePath));
  return {
    passed: false,
    details: `No test files found across ${srcFiles.length} source files. Zero test coverage.`,
  };
}

// Check 4: No error boundaries
export function checkNoErrorBoundaries(ctx) {
  const hasReactErrorBoundary = ctx.grepSourceFiles(/ErrorBoundary|error\.tsx|error\.jsx/).length > 0;
  const hasExpressErrorMiddleware = ctx.grepSourceFiles(/app\.use\s*\(\s*(?:function\s*)?(?:\(\s*)?err\s*,/).length > 0;
  const hasNestExceptionFilter = ctx.grepSourceFiles(/@Catch\(|ExceptionFilter|AllExceptionsFilter|APP_FILTER/).length > 0;
  const hasGlobalHandler = ctx.grepSourceFiles(/process\.on\s*\(\s*['"]uncaughtException|process\.on\s*\(\s*['"]unhandledRejection/).length > 0;
  const hasHonoErrorHandler = ctx.grepSourceFiles(/\.onError\s*\(|app\.notFound\s*\(/).length > 0;
  const hasFastifyErrorHandler = ctx.grepSourceFiles(/setErrorHandler\s*\(/).length > 0;

  if (hasReactErrorBoundary || hasExpressErrorMiddleware || hasNestExceptionFilter || hasGlobalHandler || hasHonoErrorHandler || hasFastifyErrorHandler) {
    return { passed: true, details: "Error handling boundaries found." };
  }

  const jsxFiles = ctx.files.filter((f) => /\.[jt]sx$/.test(f.relativePath) && ctx.isSourceFile(f.relativePath));
  const serverFiles = ctx.files.filter((f) => /\.[jt]s$/.test(f.relativePath) && ctx.isSourceFile(f.relativePath) && !/\.[jt]sx$/.test(f.relativePath));

  return {
    passed: false,
    details: `No error boundaries or global error handlers found across ${jsxFiles.length} component files and ${serverFiles.length} server files.`,
  };
}

// Check 5: No database migrations
export function checkNoDbMigrations(ctx) {
  const migrationDirs = [
    "**/prisma/migrations/**",
    "**/migrations/**",
    "**/db/migrate/**",
    "**/drizzle/**",
    "**/supabase/migrations/**",
    "src/migrations/**",
    "database/migrations/**",
    "**/pb_migrations/**",
  ];

  for (const pattern of migrationDirs) {
    if (ctx.findFiles(pattern).length > 0) {
      return { passed: true, details: "Database migration directory found." };
    }
  }

  const hasKnex = ctx.hasDep("knex");
  const hasSequelize = ctx.hasDep("sequelize");
  const hasTypeorm = ctx.hasDep("typeorm");
  if (hasKnex || hasSequelize || hasTypeorm) {
    return { passed: true, details: "ORM with migration support detected in dependencies." };
  }

  const hasPrisma = ctx.hasDep("prisma") || ctx.hasDep("@prisma/client");
  const hasDrizzle = ctx.hasDep("drizzle-orm") || ctx.hasDep("drizzle-kit");
  const hasSqlSchemaFiles = ctx.findFiles("*.sql").length > 0 || ctx.findFiles("supabase/**/*.sql").length > 0 || ctx.findFiles("**/schema.sql").length > 0;
  if (hasPrisma || hasDrizzle) {
    return {
      passed: false,
      details: "Database ORM found but no migration directory. Schema changes will destroy production data. No rollback path.",
    };
  }

  const dbDeps = [
    "prisma", "@prisma/client", "drizzle-orm", "drizzle-kit", "knex", "sequelize", "typeorm",
    "mongoose", "pg", "mysql2", "@supabase/supabase-js", "@supabase/ssr", "firebase",
    "firebase-admin", "@firebase/firestore", "pocketbase", "convex",
    "@neondatabase/serverless", "@planetscale/database", "@libsql/client",
    "better-sqlite3", "sqlite3", "@mikro-orm/core",
  ];

  if (!ctx.hasAnyDep(dbDeps) && !hasSqlSchemaFiles) {
    return { passed: true, notApplicable: true, details: "No database detected." };
  }

  return {
    passed: false,
    details: "Schema changes will destroy production data. No rollback path.",
  };
}

// Check 6: No input validation
export function checkNoInputValidation(ctx) {
  const validationLibs = ["zod", "yup", "joi", "@hapi/joi", "class-validator", "express-validator", "superstruct", "valibot", "ajv", "io-ts", "@hono/zod-validator", "@elysiajs/eden"];

  if (ctx.hasAnyDep(validationLibs)) {
    const usedInCode = ctx.grepSourceFiles(
      /z\.object\s*\(|z\.string\s*\(|z\.number\s*\(|z\.enum\s*\(|z\.array\s*\(|\.safeParse\s*\(|\.parseAsync\s*\(|yup\.object\s*\(|yup\.string\s*\(|Joi\.object\s*\(|Joi\.string\s*\(|@IsString|@IsEmail|@IsNotEmpty|@ValidateNested|checkSchema\s*\(|validationResult\s*\(|express-validator|zValidator\s*\(/,
    );
    if (usedInCode.length > 0) {
      return { passed: true, details: "Input validation library found and used in source code." };
    }
    return { passed: true, details: "Input validation library found in dependencies." };
  }

  const hasTrpc = ctx.hasAnyDep(["@trpc/server", "@trpc/react-query"]);
  if (hasTrpc) {
    const trpcInputValidation = ctx.grepSourceFiles(/\.input\s*\(\s*z\.|protectedProcedure|publicProcedure/);
    if (trpcInputValidation.length > 0) {
      return { passed: true, details: "tRPC input validation found." };
    }
  }

  const hasValidationPipe = ctx.grepSourceFiles(/ValidationPipe|new ValidationPipe/).length > 0;
  if (hasValidationPipe) {
    return { passed: true, details: "NestJS ValidationPipe found." };
  }

  const hasConvex = ctx.hasDep("convex");
  if (hasConvex && ctx.grepSourceFiles(/args\s*:\s*\{|v\.string\(\)|v\.number\(\)|v\.id\(/).length > 0) {
    return { passed: true, details: "Convex argument validation found." };
  }

  const apiHandlerFiles = ctx.grepSourceFiles(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|router\.(get|post|put)|app\.(get|post|put)|@(Get|Post|Put|Patch|Delete)\(/).length;
  return {
    passed: false,
    details: `No input validation library found${apiHandlerFiles > 0 ? ' across ' + apiHandlerFiles + ' API handler files' : ''}. User input is not validated.`,
  };
}

// Check 7: No logging / observability
export function checkNoLogging(ctx) {
  const loggingLibs = [
    "winston", "pino", "bunyan", "log4js",
    "@sentry/node", "@sentry/nextjs", "@sentry/react",
    "dd-trace", "datadog-lambda-js", "@datadog/browser-rum",
    "newrelic", "@newrelic/next",
    "@opentelemetry/api", "@opentelemetry/sdk-node",
    "logrocket", "posthog-node", "posthog-js",
    "next-axiom", "@logtail/node", "@logtail/pino",
  ];

  if (ctx.hasAnyDep(loggingLibs)) {
    return { passed: true, details: "Logging/observability library found in dependencies." };
  }

  const serverFileCount = ctx.files.filter((f) => /\.[jt]s$/.test(f.relativePath) && ctx.isSourceFile(f.relativePath) && !/\.[jt]sx$/.test(f.relativePath)).length;
  return {
    passed: false,
    details: `No logging or observability library found in dependencies. ${serverFileCount} server files have no structured logging.`,
  };
}

// Check 8: .env committed to git
export function checkEnvCommitted(ctx) {
  const hasEnvFile = ctx.hasFile(".env");
  if (!hasEnvFile) {
    return { passed: true, details: "No .env file found in repository." };
  }

  const gitignoreFiles = ctx.findFiles(".gitignore").concat(ctx.findFiles("**/.gitignore"));
  if (gitignoreFiles.length === 0) {
    return {
      passed: false,
      details: "Secrets are in your git history. Even if you delete the file, they're recoverable from past commits.",
    };
  }

  const gitignoreContent = gitignoreFiles.map((f) => f.content).join("\n");
  const lines = gitignoreContent.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const envIgnored = lines.some((line) => line === ".env" || line === ".env*" || line === "*.env" || line === ".env.*");

  if (envIgnored) {
    return { passed: true, details: ".env is listed in .gitignore." };
  }

  return {
    passed: false,
    details: "Secrets are in your git history. Even if you delete the file, they're recoverable from past commits.",
  };
}

// Check 9: Missing API auth guards
export function checkMissingApiAuthGuards(ctx) {
  const mutationHandlerPattern = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)|router\.(post|put|patch|delete)|app\.(post|put|patch|delete)|@(Post|Put|Patch|Delete)\(/;

  const nonHandlerPatterns = /\.decorator\.|\.config\.|\.d\.ts$|\.interface\.|\.type\./;

  const apiFiles = ctx.grepSourceFiles(mutationHandlerPattern).filter((f) => {
    if (nonHandlerPatterns.test(f.relativePath)) return false;

    const codeLines = f.content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    }).join("\n");

    return mutationHandlerPattern.test(codeLines);
  });

  if (apiFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No API mutation handlers detected." };
  }

  const authPatterns = /auth\(|getServerSession|getSession|requireAuth|@UseGuards|AuthGuard|middleware.*auth|isAuthenticated|verifyToken|jwt\.verify|clerkMiddleware|withAuth|currentUser|getKindeServerSession|authkitMiddleware|validateRequest|protectedProcedure|ctx\.auth/i;

  const publicEndpointPatterns = /webhook|health|public|cron|__internal/i;
  const unguardedFiles = apiFiles.filter((f) =>
    !authPatterns.test(f.content) && !publicEndpointPatterns.test(f.relativePath),
  );

  if (unguardedFiles.length === 0) {
    return { passed: true, details: "Auth guards found in all API mutation handlers." };
  }

  if (unguardedFiles.length < apiFiles.length) {
    return {
      passed: false,
      details: `${unguardedFiles.length} of ${apiFiles.length} mutation handler files lack auth guards. Anyone can hit unprotected endpoints directly.`,
    };
  }

  return {
    passed: false,
    details: "Anyone can hit your mutating endpoints directly, regardless of what the UI shows.",
  };
}

// Check 10: Cross-tenant query leakage
export function checkCrossTenantLeakage(ctx) {
  const prismaSchemaFiles = ctx.findFiles("**/schema.prisma");
  if (prismaSchemaFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No Prisma schema found." };
  }

  const schemaContent = prismaSchemaFiles.map((f) => f.content).join("\n");
  const tenantFields = ["tenantId", "orgId", "organizationId", "workspaceId", "teamId"];
  const hasTenantField = tenantFields.some((field) => schemaContent.includes(field));

  if (!hasTenantField) {
    return { passed: true, notApplicable: true, details: "No multi-tenant schema indicators found." };
  }

  const centralScopingPatterns = /\$extends\s*\(|prisma\.\$use\s*\(|PrismaMiddleware|tenantScope|withTenant|scopedPrisma|organizationId.*inject|inject.*organizationId|@Injectable[\s\S]{0,500}?prisma[\s\S]{0,500}?(?:tenantId|orgId|organizationId|workspaceId)/i;
  const hasCentralScoping = ctx.grepSourceFiles(centralScopingPatterns).length > 0;

  if (hasCentralScoping) {
    return { passed: true, details: "Centralized tenant scoping found (middleware, extension, or service injection)." };
  }

  const queryFiles = ctx.grepSourceFiles(/prisma\.\w+\.(findMany|findFirst|updateMany|deleteMany)\s*\(/);
  if (queryFiles.length === 0) {
    return { passed: true, details: "Multi-tenant schema found but no query calls detected." };
  }

  const tenantPattern = new RegExp(tenantFields.join("|"));
  const unfiltered = queryFiles.filter((f) => {
    const queries = f.content.match(/prisma\.\w+\.(findMany|findFirst|updateMany|deleteMany)\s*\([^)]*\)/g) ?? [];
    return queries.some((q) => !tenantPattern.test(q));
  });

  if (unfiltered.length === 0) {
    return { passed: true, details: "Tenant filtering found in queries." };
  }

  return {
    passed: false,
    details: "One customer can read or overwrite another customer's data. The #1 data breach pattern in multi-user apps.",
  };
}

// Check 11: No rate limiting
export function checkNoRateLimiting(ctx) {
  const authRoutePathPattern = /^(?:app\/api\/|pages\/api\/|src\/routes\/|src\/controllers\/|.*\/presentation\/auth\/)/;
  const authRoutes = ctx.files.filter(
    (f) =>
      ctx.isSourceFile(f.relativePath)
      && authRoutePathPattern.test(f.relativePath)
      && /\/login|\/signup|\/sign-up|\/register|\/otp|\/password-reset|\/forgot-password|\/invite|\/auth\//i.test(f.relativePath),
  );

  if (authRoutes.length === 0) {
    return { passed: true, notApplicable: true, details: "No auth-related API routes detected." };
  }

  const rateLimitLibs = [
    "express-rate-limit", "rate-limiter-flexible", "@nestjs/throttler",
    "@upstash/ratelimit", "bottleneck",
  ];

  if (ctx.hasAnyDep(rateLimitLibs)) {
    return { passed: true, details: "Rate limiting library found in dependencies." };
  }

  const hasRateLimitCode = ctx.grepSourceFiles(/rate[-_]?limit|throttle|RateLimit|ThrottlerGuard|@Throttle\(/i).length > 0;
  if (hasRateLimitCode) {
    return { passed: true, details: "Rate limiting implementation found." };
  }

  return {
    passed: false,
    details: "Brute force attacks, spam floods, surprise infra bills within days of launch.",
  };
}

// Check 12: Webhook signature not verified
export function checkWebhookSignatureNotVerified(ctx) {
  const webhookProviders = [
    { dep: "stripe", verify: /constructEvent|stripe\.webhooks\.constructEvent|verifyHeader/ },
    { dep: "svix", verify: /\.verify\(|wh\.verify/ },
    { dep: "@clerk/nextjs", verify: /verifyWebhook|svix|Webhook\(/ },
    { dep: "@clerk/clerk-sdk-node", verify: /verifyWebhook|svix|Webhook\(/ },
    { dep: "@lemonsqueezy/lemonsqueezy.js", verify: /verifyWebhookSignature|rawBody|x-signature/ },
    { dep: "@paddle/paddle-node-sdk", verify: /verifyWebhookSignature|unmarshal/ },
  ];

  const relevantProviders = webhookProviders.filter((p) => ctx.hasDep(p.dep));

  if (relevantProviders.length === 0) {
    return { passed: true, notApplicable: true, details: "No webhook providers detected." };
  }

  const webhookFiles = ctx.grepSourceFiles(/webhook/i);
  if (webhookFiles.length === 0) {
    return { passed: true, details: "Webhook provider in deps but no webhook handler files found." };
  }

  for (const provider of relevantProviders) {
    const verified = webhookFiles.some((f) => provider.verify.test(f.content));
    if (!verified) {
      return {
        passed: false,
        details: `Forged ${provider.dep} events can trigger fake payments, provisioning, or account changes.`,
      };
    }
  }

  return { passed: true, details: "Webhook signature verification found." };
}

// Check 13: Unbounded queries / no pagination
export function checkUnboundedQueries(ctx) {
  const apiDirPatterns = /(?:^|\/)(?:api|routes|controllers|handlers|server|presentation|datasources|queries)\//;
  const apiFiles = ctx.files.filter(
    (f) => ctx.isSourceFile(f.relativePath) && apiDirPatterns.test(f.relativePath),
  );

  if (apiFiles.length === 0) {
    return { passed: true, details: "No API handler files detected." };
  }

  const paginationPattern = /take\s*:|skip\s*:|cursor\s*:|limit\s*:|offset\s*:|paginate|\.limit\(|\.range\(|LIMIT\s+\d|\.paginate\s*\(/i;

  const problematic = apiFiles.filter((f) => {
    const prismaUnbounded = /\.findMany\s*\(\s*\)|\.findMany\s*\(\s*\{\s*\}\s*\)/.test(f.content);

    const supabaseQueries = f.content.match(/\.from\s*\([^)]*\)[\s\S]{0,240}?\.select\s*\([^)]*\)[\s\S]{0,240}?(?:;|\n|$)/g) ?? [];
    const supabaseUnbounded = supabaseQueries.some((query) => !/\.(limit|range)\s*\(/.test(query));

    const rawSqlQueries = f.content.match(/(?:sql|query|execute)\s*\(\s*['"`][\s\S]{0,300}?\bSELECT\b[\s\S]{0,300}?\bFROM\b[\s\S]{0,300}?['"`]\s*[\),]/gi) ?? [];
    const sqlUnbounded = rawSqlQueries.some((query) => !/\bLIMIT\b/i.test(query));

    const pbUnbounded = /\.getFullList\s*\(/.test(f.content);

    const convexUnbounded = /\.collect\s*\(\s*\)/.test(f.content) && !paginationPattern.test(f.content);

    const drizzleQueries = f.content.match(/db\.select\s*\([^)]*\)[\s\S]{0,200}?\.from\s*\([^)]*\)[\s\S]{0,200}?(?:;|\n|$)/g) ?? [];
    const drizzleUnbounded = drizzleQueries.some((query) => !/\.limit\s*\(/.test(query));

    return (prismaUnbounded || supabaseUnbounded || sqlUnbounded || pbUnbounded || convexUnbounded || drizzleUnbounded) && !paginationPattern.test(f.content);
  });

  if (problematic.length === 0) {
    return { passed: true, details: "Queries appear to have pagination or limits." };
  }

  const fileNames = problematic.slice(0, 3).map((f) => f.relativePath.split("/").pop()).join(", ");
  return {
    passed: false,
    details: `${problematic.length} file(s) contain queries without pagination or limits (${fileNames}${problematic.length > 3 ? ", ..." : ""}).`,
  };
}

// Check 14: Open CORS on authenticated APIs
export function checkOpenCors(ctx) {
  const authLibs = [
    "next-auth", "@auth/core", "passport", "@clerk/nextjs", "lucia", "better-auth",
    "express-session", "@nestjs/passport", "@kinde-oss/kinde-auth-nextjs",
    "@workos-inc/authkit-nextjs", "@descope/nextjs-sdk", "stytch",
  ];
  const hasAuthLib = ctx.hasAnyDep(authLibs);

  if (!hasAuthLib) {
    return { passed: true, notApplicable: true, details: "No auth library detected." };
  }

  const openCorsFiles = ctx.grepSourceFiles(/cors\(\s*\)|cors\(\s*\{\s*origin\s*:\s*['"]\*['"]/);
  const credentialsCors = ctx.grepSourceFiles(/credentials\s*:\s*true/);

  if (openCorsFiles.length > 0 && credentialsCors.length > 0) {
    return {
      passed: false,
      details: "Cross-origin data theft. Any website can make authenticated requests to your API.",
    };
  }

  if (openCorsFiles.length > 0) {
    return {
      passed: false,
      details: "Open CORS with wildcard origin on an authenticated API.",
    };
  }

  return { passed: true, details: "CORS configuration appears restrictive." };
}

// Check 15: Client/server boundary violations
export function checkClientServerBoundaryViolations(ctx) {
  const clientFiles = ctx.files.filter(
    (f) => ctx.isSourceFile(f.relativePath) && /['"]use client['"]/.test(f.content),
  );

  if (clientFiles.length === 0) {
    return { passed: true, details: "No 'use client' files found." };
  }

  const serverOnlyImports = /import\s+.*from\s+['"](?:fs|node:fs|path|node:path|child_process|node:child_process|crypto|node:crypto|@prisma\/client|pg|mysql2|mongoose|drizzle-orm|better-sqlite3)/;
  const safeEnvVars = new Set(["NODE_ENV", "VERCEL", "VERCEL_ENV", "NEXT_RUNTIME", "CI", "npm_package_version"]);

  const violations = clientFiles.filter(
    (f) => {
      const envAccesses = f.content.match(/process\.env\.(\w+)/g) ?? [];
      const hasUnsafeEnvAccess = envAccesses.some((match) => {
        const envName = match.replace("process.env.", "");
        return !/^(NEXT_PUBLIC_|EXPO_PUBLIC_|VITE_|NUXT_PUBLIC_)/.test(envName) && !safeEnvVars.has(envName);
      });

      return serverOnlyImports.test(f.content) || hasUnsafeEnvAccess;
    },
  );

  if (violations.length === 0) {
    return { passed: true, details: "No client/server boundary violations detected." };
  }

  const fileNames = violations.slice(0, 3).map((f) => f.relativePath.split("/").pop()).join(", ");
  return {
    passed: false,
    details: `${violations.length} client file(s) import server-only modules or non-public env vars (${fileNames}${violations.length > 3 ? ", ..." : ""}).`,
  };
}

// Check 16: Unrestricted file uploads
export function checkUnrestrictedFileUploads(ctx) {
  const uploadLibs = ["multer", "uploadthing", "@uploadthing/react", "formidable", "busboy", "@vercel/blob", "cloudinary"];
  const hasUploadLib = ctx.hasAnyDep(uploadLibs);

  const hasNestUpload = ctx.grepSourceFiles(/@UploadedFile\s*\(|@UseInterceptors\s*\(\s*FileInterceptor|@UploadedFiles\s*\(/).length > 0;
  const hasS3Upload = ctx.grepSourceFiles(/PutObjectCommand|@aws-sdk\/client-s3|presignedPost|s3\.upload/).length > 0;

  if (!hasUploadLib && !hasNestUpload && !hasS3Upload) {
    return { passed: true, notApplicable: true, details: "No file upload library detected." };
  }

  const hasLimits = ctx.grepSourceFiles(/fileSize|maxFileSize|limits\s*:|fileFilter|allowedMimeTypes|maxSize|maxSizeBytes|content-length-range|FileSizeValidation|maxFiles/).length > 0;

  if (!hasLimits) {
    return {
      passed: false,
      details: "Storage blowups, malicious uploads, image pipelines crashing on garbage input.",
    };
  }

  return { passed: true, details: "File upload limits detected." };
}

// Check 17: No DB transactions for multi-write flows
export function checkNoDbTransactions(ctx) {
  const writePattern = /prisma\.\w+\.(create|update|delete)\s*\(|\.\w*from\s*\([^)]*\)\s*\.(insert|update|delete|upsert)\s*\(/;
  const writeFiles = ctx.grepSourceFiles(writePattern);

  if (writeFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No database write operations detected." };
  }

  const multiWriteFiles = writeFiles.filter((f) => {
    const prismaWrites = f.content.match(/prisma\.(\w+)\.(create|update|delete)\s*\(/g) ?? [];
    const supabaseWrites = f.content.match(/\.from\s*\(['"](\w+)['"]\)\s*\.(insert|update|delete|upsert)\s*\(/g) ?? [];
    const drizzleWrites = f.content.match(/db\.(insert|update|delete)\s*\(/g) ?? [];
    const totalWrites = prismaWrites.length + supabaseWrites.length + drizzleWrites.length;

    if (totalWrites < 2) return false;

    const prismaModels = new Set(
      (f.content.match(/prisma\.(\w+)\.(create|update|delete)\s*\(/g) ?? [])
        .map((m) => m.match(/prisma\.(\w+)\./)?.[1])
        .filter(Boolean),
    );
    const supabaseModels = new Set(
      (f.content.match(/\.from\s*\(['"](\w+)['"]\)/g) ?? [])
        .map((m) => m.match(/from\s*\(['"](\w+)['"]\)/)?.[1])
        .filter(Boolean),
    );

    const allModels = new Set([...prismaModels, ...supabaseModels]);

    if (allModels.size <= 1 && drizzleWrites.length === 0) return false;

    return true;
  });

  if (multiWriteFiles.length === 0) {
    return { passed: true, details: "No multi-write operations found across different entities." };
  }

  const hasTransactions = multiWriteFiles.every(
    (f) => /\$transaction\s*\(|BEGIN|COMMIT|\.transaction\s*\(|\.rpc\s*\(|db\.transaction\s*\(|withTransaction/.test(f.content),
  );

  if (hasTransactions) {
    return { passed: true, details: "Transaction wrapping found for multi-write operations." };
  }

  const fileNames = multiWriteFiles.filter((f) => !/\$transaction\s*\(|BEGIN|COMMIT|\.transaction\s*\(|\.rpc\s*\(|db\.transaction\s*\(|withTransaction/.test(f.content))
    .slice(0, 3).map((f) => f.relativePath.split("/").pop()).join(", ");
  return {
    passed: false,
    details: `${multiWriteFiles.length} file(s) perform multiple writes to different tables without transaction wrapping (${fileNames}).`,
  };
}

// Check 18: Insecure cookie / session flags
export function checkInsecureCookieSession(ctx) {
  const cookieFiles = ctx.grepSourceFiles(/setCookie|cookies\(\)\.set|express-session|cookie-session|createSession|lucia|\.cookie\s*\(/i);

  if (cookieFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No cookie/session management detected." };
  }

  const insecurePatterns = [
    /secure\s*:\s*false/,
    /httpOnly\s*:\s*false/,
  ];

  const insecureFiles = cookieFiles.filter((f) =>
    insecurePatterns.some((pattern) => pattern.test(f.content)),
  );

  if (insecureFiles.length > 0) {
    return {
      passed: false,
      details: "Token theft, session fixation, broken auth behind HTTPS.",
    };
  }

  return { passed: true, details: "Cookie/session flags appear secure." };
}
