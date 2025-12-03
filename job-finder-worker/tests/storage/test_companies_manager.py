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
    company = {"size_label": "51-200", "hq_location": "NYC"}
    assert cm.has_good_company_data(company) is True


def test_not_good_without_location():
    cm = _cm()
    company = {"size_label": "51-200", "hq_location": ""}
    assert cm.has_good_company_data(company) is False


def test_not_good_without_size():
    cm = _cm()
    company = {"hq_location": "NYC"}
    assert cm.has_good_company_data(company) is False


def test_locations_array_counts_as_location():
    cm = _cm()
    company = {"size_min": 10, "size_max": 50, "locations": ["Remote"]}
    assert cm.has_good_company_data(company) is True


def test_empty_company_is_not_good():
    cm = _cm()
    assert cm.has_good_company_data({}) is False
