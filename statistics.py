"""
School Feeding Contribution Management System
==============================================
Python Statistics & Data Accuracy Script

This script connects to your Supabase project, pulls all data,
runs accurate statistics per student and overall, and prints a
clean report to the terminal. It also flags any data anomalies.

Requirements:
    pip install supabase pandas tabulate colorama

Usage:
    python statistics.py
"""

import sys
import os
from datetime import datetime

# Enforce UTF-8 encoding for stdout on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ── Install check ────────────────────────────────────────────────
try:
    from supabase import create_client, Client
    import pandas as pd
    from tabulate import tabulate
    from colorama import Fore, Style, init
    init(autoreset=True)
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install",
                           "supabase", "pandas", "tabulate", "colorama"])
    from supabase import create_client, Client
    import pandas as pd
    from tabulate import tabulate
    from colorama import Fore, Style, init
    init(autoreset=True)

# ── Configuration ────────────────────────────────────────────────
SUPABASE_URL = "https://qjnodyjmlzyfwsvvzlwq.supabase.co"
SUPABASE_KEY = "sb_publishable_WJsuP2ksb67C-IXxyqkfDQ_6gBXn4R_"
REQUIRED_PER_SEMESTER = 24_000  # RWF

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Helpers ──────────────────────────────────────────────────────
def rwf(amount: float) -> str:
    return f"RWF {amount:,.0f}"

def pct(value: float, total: float) -> float:
    return round((value / total * 100), 2) if total > 0 else 0.0

def status_label(total_paid: float, required: float = REQUIRED_PER_SEMESTER) -> str:
    p = pct(total_paid, required)
    if p >= 100:
        return "PAID"
    elif p >= 50:
        return "PARTIAL"
    else:
        return "BELOW HALF"

def color_status(label: str) -> str:
    if label == "PAID":
        return Fore.GREEN + label + Style.RESET_ALL
    elif label == "PARTIAL":
        return Fore.YELLOW + label + Style.RESET_ALL
    else:
        return Fore.RED + label + Style.RESET_ALL

def color_pct(p: float) -> str:
    val = f"{p:.1f}%"
    if p >= 100:
        return Fore.GREEN + val + Style.RESET_ALL
    elif p >= 50:
        return Fore.YELLOW + val + Style.RESET_ALL
    else:
        return Fore.RED + val + Style.RESET_ALL

def section(title: str):
    print()
    print(Fore.BLUE + Style.BRIGHT + "=" * 70)
    print(Fore.BLUE + Style.BRIGHT + f"  {title}")
    print(Fore.BLUE + Style.BRIGHT + "=" * 70)
    print(Style.RESET_ALL)

# ── Fetch data ───────────────────────────────────────────────────
def fetch_all():
    students_res  = supabase.table("students").select("*, classes(name)").execute()
    payments_res  = supabase.table("payments").select("*").execute()
    semesters_res = supabase.table("semesters").select("*").execute()
    classes_res   = supabase.table("classes").select("*").execute()

    students  = students_res.data  or []
    payments  = payments_res.data  or []
    semesters = semesters_res.data or []
    classes   = classes_res.data   or []

    return students, payments, semesters, classes

# ── Compute per-student stats ────────────────────────────────────
def compute_student_stats(students, payments, semesters):
    rows = []
    for student in students:
        for semester in semesters:
            student_payments = [
                p for p in payments
                if p["student_id"] == student["id"]
                and p["semester_id"] == semester["id"]
            ]
            total_paid   = sum(float(p["amount"]) for p in student_payments)
            required     = REQUIRED_PER_SEMESTER
            unpaid       = max(required - total_paid, 0)
            percentage   = pct(total_paid, required)
            pay_status   = status_label(total_paid, required)
            num_payments = len(student_payments)

            rows.append({
                "student_id":    student["id"],
                "full_name":     student["full_name"],
                "id_number":     student["admission_number"],
                "class":         student.get("classes", {}).get("name", "N/A") if student.get("classes") else "N/A",
                "semester":      semester["name"],
                "semester_id":   semester["id"],
                "required":      required,
                "total_paid":    total_paid,
                "total_unpaid":  unpaid,
                "percentage":    percentage,
                "status":        pay_status,
                "num_payments":  num_payments,
            })
    return pd.DataFrame(rows)

# ── Print overall statistics ─────────────────────────────────────
def print_overall_stats(df: pd.DataFrame, semesters: list):
    section("OVERALL SYSTEM STATISTICS")

    total_students  = df["student_id"].nunique()
    total_expected  = total_students * REQUIRED_PER_SEMESTER * len(semesters)
    total_collected = df["total_paid"].sum()
    total_unpaid    = df["total_unpaid"].sum()
    overall_pct     = pct(total_collected, total_expected)

    paid_count    = len(df[df["status"] == "PAID"])
    partial_count = len(df[df["status"] == "PARTIAL"])
    below_count   = len(df[df["status"] == "BELOW HALF"])

    stats = [
        ["Total Students",             total_students],
        ["Total Semesters",            len(semesters)],
        ["Required per Student/Sem",   rwf(REQUIRED_PER_SEMESTER)],
        ["Total Expected Collection",  rwf(total_expected)],
        ["Total Collected",            Fore.GREEN + rwf(total_collected) + Style.RESET_ALL],
        ["Total Unpaid",               Fore.RED + rwf(total_unpaid) + Style.RESET_ALL],
        ["Overall Collection Rate",    color_pct(overall_pct)],
        ["",                           ""],
        ["Students Fully Paid (PAID)",      Fore.GREEN + str(paid_count) + Style.RESET_ALL],
        ["Students Partially Paid (PARTIAL)", Fore.YELLOW + str(partial_count) + Style.RESET_ALL],
        ["Students Below Half",        Fore.RED + str(below_count) + Style.RESET_ALL],
    ]
    print(tabulate(stats, headers=["Metric", "Value"], tablefmt="grid"))

# ── Print per-semester stats ─────────────────────────────────────
def print_semester_stats(df: pd.DataFrame):
    section("STATISTICS PER SEMESTER")

    for semester in df["semester"].unique():
        sem_df = df[df["semester"] == semester]
        total_students   = len(sem_df)
        total_expected   = total_students * REQUIRED_PER_SEMESTER
        total_collected  = sem_df["total_paid"].sum()
        total_unpaid     = sem_df["total_unpaid"].sum()
        collection_pct   = pct(total_collected, total_expected)
        paid_count       = len(sem_df[sem_df["status"] == "PAID"])
        partial_count    = len(sem_df[sem_df["status"] == "PARTIAL"])
        below_count      = len(sem_df[sem_df["status"] == "BELOW HALF"])

        print(Fore.CYAN + Style.BRIGHT + f"  Semester: {semester}" + Style.RESET_ALL)
        stats = [
            ["Students",             total_students],
            ["Expected",             rwf(total_expected)],
            ["Collected",            rwf(total_collected)],
            ["Total Unpaid",         rwf(total_unpaid)],
            ["Collection Rate",      color_pct(collection_pct)],
            ["Fully Paid",           Fore.GREEN + str(paid_count) + Style.RESET_ALL],
            ["Partial",              Fore.YELLOW + str(partial_count) + Style.RESET_ALL],
            ["Below Half",           Fore.RED + str(below_count) + Style.RESET_ALL],
        ]
        print(tabulate(stats, tablefmt="simple", colalign=("left", "right")))
        print()

# ── Print per-class stats ────────────────────────────────────────
def print_class_stats(df: pd.DataFrame):
    section("STATISTICS PER CLASS")

    for cls in df["class"].unique():
        cls_df = df[df["class"] == cls]
        total_students   = cls_df["student_id"].nunique()
        total_collected  = cls_df["total_paid"].sum()
        total_expected   = cls_df["required"].sum()
        total_unpaid     = cls_df["total_unpaid"].sum()
        collection_pct   = pct(total_collected, total_expected)
        paid_count       = len(cls_df[cls_df["status"] == "PAID"])
        partial_count    = len(cls_df[cls_df["status"] == "PARTIAL"])
        below_count      = len(cls_df[cls_df["status"] == "BELOW HALF"])

        print(Fore.MAGENTA + Style.BRIGHT + f"  Class: {cls}" + Style.RESET_ALL)
        stats = [
            ["Students",        total_students],
            ["Expected",        rwf(total_expected)],
            ["Collected",       rwf(total_collected)],
            ["Total Unpaid",    rwf(total_unpaid)],
            ["Collection Rate", color_pct(collection_pct)],
            ["Fully Paid",      Fore.GREEN + str(paid_count) + Style.RESET_ALL],
            ["Partial",         Fore.YELLOW + str(partial_count) + Style.RESET_ALL],
            ["Below Half",      Fore.RED + str(below_count) + Style.RESET_ALL],
        ]
        print(tabulate(stats, tablefmt="simple", colalign=("left", "right")))
        print()

# ── Print per-student detail table ───────────────────────────────
def print_student_detail(df: pd.DataFrame):
    section("PER-STUDENT PAYMENT DETAIL")

    display_df = df[[
        "full_name", "id_number", "class", "semester",
        "total_paid", "required", "total_unpaid", "percentage", "status"
    ]].copy()

    display_df["total_paid"]   = display_df["total_paid"].apply(lambda x: f"RWF {x:,.0f}")
    display_df["required"]     = display_df["required"].apply(lambda x: f"RWF {x:,.0f}")
    display_df["total_unpaid"] = display_df["total_unpaid"].apply(
        lambda x: f"RWF {x:,.0f}" if x > 0 else Fore.GREEN + "Cleared" + Style.RESET_ALL
    )
    display_df["percentage"]   = display_df["percentage"].apply(color_pct)
    display_df["status"]       = display_df["status"].apply(color_status)

    display_df.columns = [
        "Full Name", "ID Number", "Class", "Semester",
        "Total Paid", "Required", "Total Unpaid", "% Paid", "Status"
    ]

    print(tabulate(display_df, headers="keys", tablefmt="grid", showindex=False))

# ── Anomaly detection ────────────────────────────────────────────
def detect_anomalies(df: pd.DataFrame, payments: list):
    section("DATA INTEGRITY & ANOMALY CHECK")
    issues = []

    # Overpayments
    overpaid = df[df["total_paid"] > df["required"]]
    for _, row in overpaid.iterrows():
        issues.append(f"[WARNING] Overpayment: {row['full_name']} ({row['semester']}) "
                      f"paid {rwf(row['total_paid'])} vs required {rwf(row['required'])}")

    # Negative payments without positive ones
    for p in payments:
        if float(p["amount"]) < 0:
            student_positive = [x for x in payments
                                if x["student_id"] == p["student_id"] and float(x["amount"]) > 0]
            if not student_positive:
                issues.append(f"[WARNING] Negative-only payment found for student ID {p['student_id'][:8]}...")

    # Zero payment records
    zero_payments = [p for p in payments if float(p["amount"]) == 0]
    if zero_payments:
        issues.append(f"[WARNING] {len(zero_payments)} zero-amount payment record(s) found.")

    if not issues:
        print(Fore.GREEN + "  [OK] No data anomalies detected. All records look clean!" + Style.RESET_ALL)
    else:
        for issue in issues:
            print(Fore.YELLOW + f"  {issue}" + Style.RESET_ALL)

    print()

# ── Main ─────────────────────────────────────────────────────────
def main():
    print()
    print(Fore.BLUE + Style.BRIGHT + "+" + "-" * 70 + "+")
    print(Fore.BLUE + Style.BRIGHT + "|    SCHOOL FEEDING CONTRIBUTION MANAGEMENT - PYTHON STATISTICS        |")
    print(Fore.BLUE + Style.BRIGHT + f"|    Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}                               |")
    print(Fore.BLUE + Style.BRIGHT + "+" + "-" * 70 + "+")
    print(Style.RESET_ALL)

    print("  Connecting to Supabase and fetching data...")
    try:
        students, payments, semesters, classes = fetch_all()
    except Exception as e:
        print(Fore.RED + f"  Failed to connect: {e}" + Style.RESET_ALL)
        return

    print(f"  [OK] Fetched {len(students)} students, {len(payments)} payments, "
          f"{len(semesters)} semesters, {len(classes)} classes.")

    if not students:
        print(Fore.YELLOW + "\n  [NOTICE] No students found. Please add students and semesters first." + Style.RESET_ALL)
        return

    if not semesters:
        print(Fore.YELLOW + "\n  [NOTICE] No semesters found. Please add semesters first." + Style.RESET_ALL)
        return

    df = compute_student_stats(students, payments, semesters)

    print_overall_stats(df, semesters)
    print_semester_stats(df)
    print_class_stats(df)
    print_student_detail(df)
    detect_anomalies(df, payments)

    print(Fore.BLUE + Style.BRIGHT + "  Report complete." + Style.RESET_ALL)
    print()

if __name__ == "__main__":
    main()
