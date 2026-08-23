import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getAuditLogs, sanitizeAuditMetadata, writeAuditLog } from "../../lib/audit";
import { AuthorizationDeniedError, resolveAuthorizationContext } from "../../lib/authorization";
import { getAuthorizedLocations, getCurrentLocation, LocationDomainError, setCurrentLocation } from "../../lib/locations";
import { MembershipDomainError, setMembershipLocations, setMembershipRoles } from "../../lib/memberships";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("Security hardening tests require a _test database.");

let companyA="", companyB="", userA="", userB="", adminMembership="", memberMembership="", locationA="", locationB="", foreignLocation="";
const suffix=randomUUID().slice(0,8);

before(async()=>{
  const adminRole=await prisma.role.findUniqueOrThrow({where:{code:"SUPER_ADMIN"}});
  const [ca,cb,ua,ub]=await Promise.all([
    prisma.company.create({data:{name:`Security A ${suffix}`}}),
    prisma.company.create({data:{name:`Security B ${suffix}`}}),
    prisma.user.create({data:{email:`security-a-${suffix}@test.invalid`,firstName:"Security",lastName:"A",password:"test"}}),
    prisma.user.create({data:{email:`security-b-${suffix}@test.invalid`,firstName:"Security",lastName:"B",password:"test"}}),
  ]); companyA=ca.id;companyB=cb.id;userA=ua.id;userB=ub.id;
  const [la,lb,lf]=await Promise.all([
    prisma.location.create({data:{companyId:companyA,code:`SA-${suffix}`,name:"Security A",isHeadquarters:true}}),
    prisma.location.create({data:{companyId:companyA,code:`SB-${suffix}`,name:"Security B"}}),
    prisma.location.create({data:{companyId:companyB,code:`SF-${suffix}`,name:"Security Foreign",isHeadquarters:true}}),
  ]);locationA=la.id;locationB=lb.id;foreignLocation=lf.id;
  await prisma.$transaction(async tx=>{
    const admin=await tx.membership.create({data:{companyId:companyA,userId:userA,active:true,isDefault:true,defaultLocationId:locationA,roles:{create:{roleId:adminRole.id}}}});
    const member=await tx.membership.create({data:{companyId:companyA,userId:userB,active:true,isDefault:false,defaultLocationId:locationA}});
    await tx.membershipLocation.createMany({data:[{companyId:companyA,membershipId:admin.id,locationId:locationA},{companyId:companyA,membershipId:admin.id,locationId:locationB},{companyId:companyA,membershipId:member.id,locationId:locationA}]});
    adminMembership=admin.id;memberMembership=member.id;
  });
});

after(async()=>{
  await prisma.auditLog.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.partner.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.item.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.itemCategory.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.membership.updateMany({where:{companyId:{in:[companyA,companyB]}},data:{defaultLocationId:null}});
  await prisma.membershipLocation.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.membershipRole.deleteMany({where:{membership:{companyId:{in:[companyA,companyB]}}}});
  await prisma.membership.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.location.deleteMany({where:{companyId:{in:[companyA,companyB]}}});
  await prisma.company.deleteMany({where:{id:{in:[companyA,companyB]}}});
  await prisma.user.deleteMany({where:{id:{in:[userA,userB]}}});
  await prisma.$disconnect();
});

test("AUTH: active context is DB-revalidated and stale roles disappear",async()=>{
  const claims={companyId:companyA,userId:userA,membershipId:adminMembership};
  assert.ok((await resolveAuthorizationContext(claims)).roles.includes("SUPER_ADMIN"));
  await setMembershipRoles(companyA,adminMembership,adminMembership,[]);
  assert.deepEqual((await resolveAuthorizationContext(claims)).roles,[]);
  const role=await prisma.role.findUniqueOrThrow({where:{code:"SUPER_ADMIN"}});
  await prisma.membershipRole.create({data:{membershipId:adminMembership,roleId:role.id}});
});

test("AUTH: disabled user, Membership, Company and stale membership are denied",async()=>{
  const claims={companyId:companyA,userId:userB,membershipId:memberMembership};
  await prisma.user.update({where:{id:userB},data:{active:false}}); await assert.rejects(resolveAuthorizationContext(claims),AuthorizationDeniedError); await prisma.user.update({where:{id:userB},data:{active:true}});
  await prisma.membership.update({where:{id:memberMembership},data:{active:false}}); await assert.rejects(resolveAuthorizationContext(claims),AuthorizationDeniedError); await prisma.membership.update({where:{id:memberMembership},data:{active:true}});
  await prisma.company.update({where:{id:companyA},data:{active:false}}); await assert.rejects(resolveAuthorizationContext(claims),AuthorizationDeniedError); await prisma.company.update({where:{id:companyA},data:{active:true}});
  await assert.rejects(resolveAuthorizationContext({...claims,membershipId:randomUUID()}),AuthorizationDeniedError);
  await assert.rejects(resolveAuthorizationContext({...claims,companyId:companyB}),AuthorizationDeniedError);
});

test("LOCATION ACL: switcher/current include only explicit allowed locations",async()=>{
  assert.deepEqual((await getAuthorizedLocations(companyA,memberMembership)).map(x=>x.id),[locationA]);
  assert.equal((await getCurrentLocation(companyA,memberMembership))?.id,locationA);
  await assert.rejects(setCurrentLocation(companyA,memberMembership,locationB,userB),LocationDomainError);
  await assert.rejects(setCurrentLocation(companyA,memberMembership,foreignLocation,userB),LocationDomainError);
  await assert.rejects(setCurrentLocation(companyA,memberMembership,randomUUID(),userB),LocationDomainError);
  await setMembershipLocations(companyA,adminMembership,memberMembership,[locationA,locationB],locationB);
  assert.equal((await setCurrentLocation(companyA,memberMembership,locationB,userB)).id,locationB);
});

test("LOCATION ACL: default must be authorized and SUPER_ADMIN has no implicit bypass",async()=>{
  await assert.rejects(setMembershipLocations(companyA,adminMembership,memberMembership,[locationA],locationB),MembershipDomainError);
  await prisma.membershipLocation.delete({where:{companyId_membershipId_locationId:{companyId:companyA,membershipId:adminMembership,locationId:locationB}}});
  await assert.rejects(setCurrentLocation(companyA,adminMembership,locationB,userA),LocationDomainError);
  await prisma.membershipLocation.create({data:{companyId:companyA,membershipId:adminMembership,locationId:locationB}});
});

test("TENANT REFERENCES: category, agent and actor references reject cross-company IDs",async()=>{
  const [category,agent]=await Promise.all([
    prisma.itemCategory.create({data:{companyId:companyB,code:`CAT-${suffix}`,name:"Foreign category"}}),
    prisma.partner.create({data:{companyId:companyB,code:`AG-${suffix}`,name:"Foreign agent",isAgent:true}}),
  ]);
  await assert.rejects(prisma.item.create({data:{companyId:companyA,code:`ITEM-${suffix}`,name:"Invalid category",type:"SERVICE",categoryId:category.id}}));
  const categoryFk=await prisma.$queryRaw<Array<{definition:string}>>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='BusinessDocumentLine_companyId_itemCategoryId_fkey'`;
  assert.match(categoryFk[0].definition,/FOREIGN KEY \("companyId", "itemCategoryId"\)/);
  await assert.rejects(prisma.partner.create({data:{companyId:companyA,code:`P-${suffix}`,name:"Invalid agent",agentId:agent.id}}));
  await assert.rejects(prisma.itemCategory.create({data:{companyId:companyB,code:`ACT-${suffix}`,name:"Invalid actor",createdById:userA}}));
});

test("AUDIT: administrative mutation is tenant-isolated and secrets are removed",async()=>{
  await writeAuditLog({companyId:companyA,membershipId:adminMembership,userId:userA,locationId:locationA,action:"SECURITY_TEST",entityType:"Membership",entityId:memberMembership,metadata:{safe:"yes",password:"no",accessToken:"no",nested:{cookie:"no",value:1}}});
  const own=await getAuditLogs(companyA,{entityType:"Membership"}); const foreign=await getAuditLogs(companyB,{entityType:"Membership"});
  const row=own.find(x=>x.action==="SECURITY_TEST"); assert.ok(row); assert.equal(foreign.some(x=>x.id===row.id),false);
  const serialized=JSON.stringify(row.metadata); assert.match(serialized,/safe/); assert.doesNotMatch(serialized,/password|token|cookie|no/i);
  assert.deepEqual(sanitizeAuditMetadata({secret:"x",ok:true}),{ok:true});
});

test("LEGACY: operational location columns are NOT NULL and all legacy constraints are validated",async()=>{
  const nullable=await prisma.$queryRaw<Array<{table_name:string,column_name:string}>>`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name='locationId' AND table_name IN ('BusinessDocument','DocumentSeries','RestaurantMenu','FinancialAccount','PaymentSchedule','FinancialMovement','FinancialAllocation','FinancialTransfer','BankStatement','BankStatementLine') AND is_nullable='YES'`;
  assert.deepEqual(nullable,[]);
  const invalid=await prisma.$queryRaw<Array<{conname:string}>>`SELECT conname FROM pg_constraint WHERE NOT convalidated`;
  assert.deepEqual(invalid,[]);
});
