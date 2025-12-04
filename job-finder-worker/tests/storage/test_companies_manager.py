import datetime

from job_finder.storage.companies_manager import CompaniesManager


def _cm():
    return CompaniesManager(db_path=":memory:")


def test_good_when_updated_after_creation():
    cm = _cm()
    now = datetime.datetime.utcnow().isoformat()
    earlier = (datetime.datetime.utcnow() - datetime.timedelta(minutes=5)).isoformat()
    assert cm.has_good_company_data({"created_at": earlier, "updated_at": now}) is True


def test_good_when_size_and_location_present():
    cm = _cm()
    company = {"companySizeCategory": "51-200", "headquartersLocation": "NYC"}
    assert cm.has_good_company_data(company) is True


def test_not_good_without_location():
    cm = _cm()
    company = {"companySizeCategory": "51-200", "headquartersLocation": ""}
    assert cm.has_good_company_data(company) is False


def test_not_good_without_size():
    cm = _cm()
    company = {"headquartersLocation": "NYC"}
    assert cm.has_good_company_data(company) is False


def test_locations_array_counts_as_location():
    cm = _cm()
    company = {
        "companySizeCategory": "11-50",
        "headquartersLocation": "Remote",
    }
    assert cm.has_good_company_data(company) is True


def test_empty_company_is_not_good():
    cm = _cm()
    assert cm.has_good_company_data({}) is False
