# Bug Fixes Summary - AsyncLocalStorage Context Propagation

## Overview
Fixed critical bug causing internal server errors (500) on authenticated requests when running on NSSM/IIS. The issue was that the AsyncLocalStorage request context was not being properly propagated through the Express middleware chain, causing the Prisma audit log middleware to fail when trying to record changes.

## Root Cause
In `backend/src/middleware/auth.ts`, the `requireAuth` middleware was incorrectly calling:
```typescript
runWithUser(payload.sub, next);  // ❌ next is never called
```

This passed `next` (a function) as a callback parameter but never actually invoked it. As a result:
- The AsyncLocalStorage context was created but never used
- `next()` was never called, breaking the middleware chain
- The request would hang or timeout
- On NSSM/IIS, this manifested as 500 Internal Server Errors
- All downstream handlers and the Prisma audit log middleware couldn't access `getCurrentUserId()`

## Solution Applied
Changed to properly execute `next()` within the AsyncLocalStorage context:
```typescript
return runWithUser(payload.sub, () => next());  // ✅ Correct
```

This ensures:
1. The AsyncLocalStorage context is created
2. `next()` executes **inside** that context
3. All subsequent Prisma calls have access to the user ID via `getCurrentUserId()`
4. Audit logs can be properly recorded

## Files Modified

### 1. **backend/src/middleware/auth.ts** ✅
- **Commit:** 9f897c94812753976d86ae0fd82acb799bfa3b60
- **Change:** Fixed middleware context propagation
- **Impact:** All authenticated requests now maintain request context

### 2. **backend/src/modules/tasks/tasks.controller.ts** ✅
- **Commit:** 1d0e5296b414470e5987cf5c188177c89ec414e4
- **Changes:** Wrapped all service calls with `runWithUser()`:
  - `listHandler()`
  - `getHandler()`
  - `createHandler()`
  - `updateHandler()`
  - `updateProgressHandler()`
  - `deleteHandler()`
  - `cloneHandler()`
  - `bulkImportHandler()`
  - `uploadAttachmentHandler()`
  - `deleteAttachmentHandler()`
- **Impact:** Task operations now properly record audit logs

### 3. **backend/src/modules/users/users.controller.ts** ✅
- **Commit:** ae01aebd8b2889f75320bd4506e44704651f15c0
- **Changes:** Wrapped all service calls with `runWithUser()`:
  - `listHandler()`
  - `getHandler()`
  - `createHandler()`
  - `updateHandler()`
  - `deleteHandler()`
- **Impact:** User operations (create, update, delete) now properly record audit logs

### 4. **backend/src/modules/projects/projects.controller.ts** ✅
- **Commit:** 81fb7c642f04a0c47ed2d2a909927c95026f9a8a
- **Changes:** Wrapped all service calls with `runWithUser()`:
  - `listHandler()`
  - `getHandler()`
  - `createHandler()`
  - `updateHandler()`
  - `deleteHandler()`
- **Impact:** Project operations now properly record audit logs

### 5. **backend/src/modules/milestones/milestones.controller.ts** ✅
- **Commit:** 2b6359e45e44e6cb196bf84f1b8cd0c24bde1414
- **Changes:** Wrapped all service calls with `runWithUser()`:
  - `listHandler()`
  - `getHandler()`
  - `createHandler()`
  - `updateHandler()`
  - `deleteHandler()`
- **Impact:** Milestone operations now properly record audit logs

## Testing Recommendations

### Local Testing (Before Deploying)
1. **Test task creation** (the original failing endpoint):
   ```bash
   POST /api/tasks
   Content-Type: application/json
   Authorization: Bearer <token>
   
   {
     "name": "Test Task",
     "projectId": "<projectId>",
     "milestoneId": "<milestoneId>",
     "departmentId": "<departmentId>"
   }
   ```
   Expected: 201 Created (not 500)

2. **Verify audit logs are recorded**:
   ```bash
   GET /api/admin/audit-log
   Authorization: Bearer <token>
   ```
   Should show entries for the task creation

3. **Test other operations**:
   - Create/update/delete users
   - Create/update/delete projects
   - Create/update/delete milestones
   - Update task status
   - Upload task attachments

### NSSM/IIS Specific Testing
1. Restart the NSSM service
2. Monitor the application logs for any hanging requests
3. Test concurrent requests to ensure context isolation works correctly
4. Verify that different users' requests don't leak context between them

## Migration Steps

1. **Backup current main branch** (if in production):
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Test the bugs branch**:
   ```bash
   git checkout bugs
   npm install
   npm run build
   npm test  # Run test suite
   ```

3. **Deploy**:
   - If testing passes, merge `bugs` → `main`
   - Rebuild Docker image or redeploy NSSM service
   - Restart the backend service

## Potential Side Effects (None Expected)

✅ **Safe Changes:**
- Only affects authenticated requests (context already exists)
- Uses existing utilities (`runWithUser()`, `getCurrentUserId()`)
- No database schema changes
- No API contract changes
- Backwards compatible

## Related Files (No Changes Needed)

- `backend/src/config/prisma.ts` - Audit log middleware (already correct)
- `backend/src/utils/requestContext.ts` - AsyncLocalStorage (already correct)
- Other module controllers that don't write to audited entities

## Notes

- The fix specifically addresses the **audit log** context issue
- If you see errors related to `TimesheetEntry` or `User` updates not being audited, those modules should also be wrapped (follow same pattern)
- Consider adding `runWithUser()` wrapping to any new controller handlers that call service functions with database writes

## Branch Status
✅ All changes committed to `bugs` branch  
⏳ Ready for PR review and testing before merging to `main`

---

**Created:** 2026-08-09  
**Branch:** `bugs`  
**Parent:** `main` (f2ab84afc7b8d9a7d7d5e9974d082349b8e99574)
