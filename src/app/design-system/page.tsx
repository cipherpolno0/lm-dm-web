import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertTriangle,
  CheckCircle2,
  Info as InfoIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Design System",
};

/**
 * /design-system — หน้าสาธิต component ทั้งหมดของ P4 (Header/Footer มาจาก
 * RootLayout อยู่แล้ว หน้านี้โชว์เฉพาะ component ระดับเนื้อหา) ใช้เป็นทั้งเอกสาร
 * อ้างอิงระหว่างพัฒนาและเป็นหน้าเป้าหมายหลักของการทดสอบ responsive/overflow
 * (prisma/test-layout-responsive.mjs) เพราะรวมทุก component ไว้ในหน้าเดียว
 *
 * ขอบเขตที่ตัดออก (โปร่งใส — ดู prisma/design-system.md): หน้านี้เป็นหน้าอ้างอิง
 * สำหรับทีมพัฒนา ไม่ปรากฏใน sitemap.md และไม่มีลิงก์จาก nav หลัก — ควรพิจารณา
 * gate ด้วย permission (เช่น เฉพาะ Super Admin) หรือลบออกก่อนขึ้น production จริง
 * ยังไม่ได้ทำในงานนี้เพราะเป็นเพียงหน้าสาธิต ไม่มีข้อมูลจริง/action ที่กระทบข้อมูล
 */
export default function DesignSystemPage() {
  return (
    <Container className="flex w-full flex-col gap-10 pb-16">
      <PageHeader
        title="Design System"
        description="รวม component ทั้งหมดของ P4 — Header, Nav, Breadcrumbs, Footer, Cards, Tables, Forms, Empty/Loading/Error states"
        breadcrumbs={[{ label: "Design System" }]}
      />

      {/* Buttons */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Buttons</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-3 pt-6">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </CardContent>
        </Card>
      </section>

      {/* Badges */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Badges</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">อนุมัติแล้ว</Badge>
            <Badge variant="warning">รอตรวจทาน</Badge>
            <Badge variant="info">ข้อมูล</Badge>
          </CardContent>
        </Card>
      </section>

      {/* Cards */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Cards</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>หัวข้อการ์ด</CardTitle>
              <CardDescription>คำอธิบายสั้นใต้หัวข้อ</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              เนื้อหาตัวอย่างภายในการ์ด
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>การ์ดพร้อม Badge</CardTitle>
              <CardDescription>ใช้แสดงสถานะร่วมกับเนื้อหา</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="success">ใช้งานได้</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>การ์ดพร้อมปุ่ม</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline">
                ดูรายละเอียด
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tables */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Tables</h2>
        <Card>
          <CardHeader>
            <CardTitle>ตารางข้อมูล (มีแถว)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัสอ้างอิง</TableHead>
                  <TableHead>ชื่อ (สมมติ)</TableHead>
                  <TableHead>สังกัด (สมมติ)</TableHead>
                  <TableHead>ระดับชั้น</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "REF-0001", name: "ผู้เข้าสอบตัวอย่าง ก", org: "สำนักเรียนตัวอย่าง 1", level: "นักธรรมตรี", status: "ผ่าน" },
                  { id: "REF-0002", name: "ผู้เข้าสอบตัวอย่าง ข", org: "สำนักเรียนตัวอย่าง 2", level: "ธรรมศึกษาโท", status: "รอผล" },
                  { id: "REF-0003", name: "ผู้เข้าสอบตัวอย่าง ค", org: "สำนักเรียนตัวอย่าง 1", level: "บาลีประโยค 1-2", status: "ไม่ผ่าน" },
                ].map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.org}</TableCell>
                    <TableCell>{row.level}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "ผ่าน"
                            ? "success"
                            : row.status === "รอผล"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ตารางข้อมูล (ไม่มีแถว — Empty State)</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="ไม่พบข้อมูลตรงเงื่อนไข"
              description="ลองปรับตัวกรองแล้วค้นหาใหม่อีกครั้ง"
              action={
                <Button size="sm" variant="outline">
                  ล้างตัวกรอง
                </Button>
              }
            />
          </CardContent>
        </Card>
      </section>

      {/* Forms */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Forms</h2>
        <Card>
          <CardHeader>
            <CardTitle>ฟอร์มตัวอย่าง</CardTitle>
            <CardDescription>
              ข้อมูลสมมติล้วนๆ — ยังไม่ผูก submit/validation จริง (ดูขอบเขตที่ตัดออก)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* <div> ไม่ใช่ <form> — หน้านี้เป็น Server Component ล้วนๆ (ไม่มี
                "use client") ส่ง event handler เช่น onSubmit ให้ element ธรรมดา
                จาก Server Component ไม่ได้ ฟอร์มสาธิตนี้ไม่ submit จริงอยู่แล้ว
                (ยังไม่ผูก action/validation จริงตามที่ระบุในขอบเขตที่ตัดออก) */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="ชื่อ-นามสกุล (สมมติ)" required>
                {(field) => <Input {...field} placeholder="เช่น สามเณรสมมติ ใจดี" />}
              </FormField>
              <FormField
                label="อีเมล"
                required
                error="รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่างข้อความ error)"
              >
                {(field) => (
                  <Input {...field} type="email" placeholder="name@example.com" />
                )}
              </FormField>
              <FormField label="สายการศึกษา" description="เลือกได้ 1 สาย">
                {(field) => (
                  <Select {...field} defaultValue="naktham">
                    <option value="naktham">นักธรรม</option>
                    <option value="dhammastudies">ธรรมศึกษา</option>
                    <option value="pali">บาลี</option>
                  </Select>
                )}
              </FormField>
              <FormField label="หมายเหตุ" className="sm:col-span-2">
                {(field) => (
                  <Textarea {...field} placeholder="ข้อความเพิ่มเติม (ถ้ามี)" rows={3} />
                )}
              </FormField>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="ds-accept" defaultChecked />
                <Label htmlFor="ds-accept">ยอมรับข้อกำหนดการใช้งาน (ตัวอย่าง)</Label>
              </div>
              <div className="sm:col-span-2">
                <Button type="button">บันทึก (ตัวอย่าง — ยังไม่ submit จริง)</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Alerts */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
        <div className="flex flex-col gap-3">
          <Alert variant="info">
            <InfoIcon />
            <AlertTitle>ข้อมูล</AlertTitle>
            <AlertDescription>ข้อความแจ้งเตือนทั่วไป</AlertDescription>
          </Alert>
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>สำเร็จ</AlertTitle>
            <AlertDescription>บันทึกข้อมูลเรียบร้อยแล้ว</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>คำเตือน</AlertTitle>
            <AlertDescription>โปรดตรวจสอบข้อมูลก่อนดำเนินการต่อ</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>ข้อผิดพลาด</AlertTitle>
            <AlertDescription>ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่</AlertDescription>
          </Alert>
        </div>
      </section>

      {/* Loading skeletons */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Loading State</h2>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </section>

      {/* Empty state (standalone preview) */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Empty State</h2>
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="ยังไม่มีรายการ"
              description="เมื่อมีข้อมูลแล้ว รายการจะปรากฏที่นี่"
            />
          </CardContent>
        </Card>
      </section>

      {/* Error state (static preview — ไม่ใช่ error boundary จริง) */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Error State</h2>
        <Card>
          <CardContent className="pt-6">
            <ErrorState />
          </CardContent>
        </Card>
      </section>

      <Separator />
      <p className="text-muted-foreground text-xs">
        หน้านี้เป็นหน้าอ้างอิงสำหรับทีมพัฒนา (ไม่อยู่ใน sitemap.md) — ข้อมูลทั้งหมด
        เป็นข้อความ/ตัวเลขสมมติ ไม่มีข้อมูลบุคคลจริง
      </p>
    </Container>
  );
}
