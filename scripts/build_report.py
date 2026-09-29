from docx import Document
from docx.shared import Inches, Pt
from pathlib import Path
E = Path(__file__).resolve().parent.parent / 'docs' / 'evidence'
doc = Document()
doc.styles['Normal'].font.size = Pt(10.5)
doc.add_heading('IT2406 Performance Task 1: PS and FI, Development of Ultralight Bike', 0)
doc.add_paragraph('System M53, client 236, host m53p.ucc.cloud. SAP user LEARN-653, project P/2653. Session date 2026-09-29.')
doc.add_heading('Status per task (verified by live read-back)', 1)
t = doc.add_table(rows=1, cols=3); t.style = 'Light Grid Accent 1'
for i, h in enumerate(['Task', 'Status', 'Evidence']): t.rows[0].cells[i].text = h
rows = [
 ('1 Project, WBS, responsible cost centres', 'Done and saved', 'CJ03 opens P/2653; grid read-back 6 WBS, PE+Acct ticked, CA EU00, EURD1000/EURD1000/EURD1000/EUQM1000/EUPR1000/EUQM1000'),
 ('2a Activities 0010-0140 + WBS assignment', 'Done and saved', 'Save message "Project P/2653 is being changed"; reopened tree lists network 4000100 activities 0010-0140'),
 ('2b External 0045 service lines, 2c primary cost 0135', 'Not done', 'Not started this session'),
 ('3 to 14', 'Not done', 'Not started this session; depend on task 2 completion'),
]
for r in rows:
    c = t.add_row().cells
    for i, v in enumerate(r): c[i].text = v
figs = [
 ('t1-wbs-responsibilities.jpg', 'Figure 1. Task 1, CJ20N Responsibilities tab: WBS P/2653 to P/2653-5, controlling area EU00, responsible cost centres. Required screenshot 1 of 7.'),
 ('t2-activity-overview.jpg', 'Figure 2. Task 2, CJ20N Activity Overview before save: 14 activities with duration, work, work centre. Partial: 0045 and 0135 not yet entered, so this is not the final required screenshot 2.'),
 ('probe-LEARN653-worklist.jpg', 'Appendix A1. Before this session: LEARN-653 worklist held only P/9000. CJ03 returned "Project P/2653 does not exist".'),
 ('v-report-P2653-before.jpg', 'Appendix A2. Validate run #6 on the live site: S_ALR_87013542 for P/2653 returned "No objects were selected" (project did not exist yet).'),
 ('site-login.jpg', 'Appendix A3. Control site ultralight-project-builder.pages.dev, sign-in screen.'),
]
doc.add_heading('Screenshots', 1)
for f, cap in figs:
    p = E / f
    if p.exists():
        doc.add_picture(str(p), width=Inches(6.3))
        doc.add_paragraph(cap).runs[0].italic = True
doc.add_heading('Conclusion', 1)
doc.add_paragraph('The conclusion compares the planned cost reports (tasks 8, 12) with the final actual report (task 14). Those reports cannot be written yet: tasks 8 to 14 are not done for P/2653. The expected figures from the task sheet are actual 1,750.00 EUR after the 35 h confirmation and 11,450.00 EUR after the 9,700.00 EUR invoice. They are targets, not results.')
doc.add_heading('Not confirmed', 1)
for s in ['The grading monitor for LEARN-653. Only the user can open it.',
          'Whether the Oracle runner password for LEARN-626 was changed on purpose. SAP rejected it in validate run #5.',
          'Tasks 3 and 5 (network graph). Not opened this session.']:
    doc.add_paragraph(s, style='List Bullet')
out = Path(__file__).resolve().parent.parent / 'IT2406_Performance_Task_1_Ultralight_Bike_LEARN-653.docx'
doc.save(out); print(out)
